import pandas as pd
import json
import scipy.sparse as sparse
from collections import defaultdict
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import pickle
import psycopg2
import sys
import os
import datetime
from config import DB_CONFIG

class RecommendationEngine:
    def __init__(self):
        self.db_config = DB_CONFIG
        self.categories_df = None
        self.users_df = None
        self.products_df = None
        self.user_interests_df = None
        self.wishlist_df = None
        self.user_item_matrix = None
        self.similarity_matrix = None
        self.product_similarity_matrix = None

    def connect_db(self):
        return psycopg2.connect(**self.db_config)
    
    def sampleData(self):
        conn = self.connect_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM "Product" ORDER BY RANDOM() LIMIT 800;')
        products = cursor.fetchall()

        return [p[0] for p in products]
    
    def loadData(self):
        conn = self.connect_db()
        cursor = conn.cursor()
        
        # Load users
        cursor.execute("SELECT * FROM \"User\";")
        users = cursor.fetchall()
        self.users_df = pd.DataFrame(users, columns=[desc[0] for desc in cursor.description])
        
        # Load categories
        cursor.execute("SELECT * FROM \"Category\";")
        categories = cursor.fetchall()
        self.categories_df = pd.DataFrame(categories, columns=[desc[0] for desc in cursor.description])
        
        # Load products with their categories and brands
        cursor.execute("""
            SELECT p.*, c.name as category_name, b.name as brand_name 
            FROM "Product" p
            JOIN "Category" c ON p.category_id = c.id
            JOIN "Brand" b ON p.brand_id = b.id;
        """)
        products = cursor.fetchall()
        self.products_df = pd.DataFrame(products, columns=[desc[0] for desc in cursor.description])
        
        # Load user interested categories
        cursor.execute("""
            SELECT "A" as user_id, "B" as category_id 
            FROM "_UserInterestedCategories";
        """)
        user_interests = cursor.fetchall()
        self.user_interests_df = pd.DataFrame(user_interests, columns=[desc[0] for desc in cursor.description])
        
        # Load wishlists
        cursor.execute("SELECT * FROM \"Wishlist\";")
        wishlists = cursor.fetchall()
        self.wishlist_df = pd.DataFrame(wishlists, columns=[desc[0] for desc in cursor.description])
        
        cursor.close()
        conn.close()
    
    def build_user_item_matrix(self):
        users = self.users_df["id"].unique()
        products = self.products_df["id"].unique()

        self.user_to_index = {user: i for i, user in enumerate(users)}
        self.index_to_user = {i: user for user, i in self.user_to_index.items()}
        self.product_to_index = {product: i for i, product in enumerate(products)}
        self.index_to_product = {i: product for product, i in self.product_to_index.items()}

        rows = []
        cols = []
        data = []

        # Add wishlist interactions
        for _, row in self.wishlist_df.iterrows():
            user_id = row["userId"]
            product_id = row["productId"]

            if user_id in self.user_to_index and product_id in self.product_to_index:
                rows.append(self.user_to_index[user_id])
                cols.append(self.product_to_index[product_id])
                data.append(1.0)  # Higher weight for wishlist items

        # Add category interest interactions
        for _, row in self.user_interests_df.iterrows():
            user_id = row["user_id"]
            category_id = row["category_id"]
            
            # Get all products in this category
            category_products = self.products_df[self.products_df["category_id"] == category_id]["id"]
            
            for product_id in category_products:
                if user_id in self.user_to_index and product_id in self.product_to_index:
                    rows.append(self.user_to_index[user_id])
                    cols.append(self.product_to_index[product_id])
                    data.append(0.5)  # Lower weight for category interests

        self.user_item_matrix = sparse.csr_matrix(
            (data, (rows, cols)), shape=(len(users), len(products))
        )

    def build_product_similarity_matrix(self):
        # Create product features matrix
        product_features = []
        for _, product in self.products_df.iterrows():
            features = {
                'category_id': product['category_id'],
                'brand_id': product['brand_id']
            }
            product_features.append(features)
        
        # Convert to DataFrame
        features_df = pd.DataFrame(product_features)
        
        # Create one-hot encoding for categorical features
        category_dummies = pd.get_dummies(features_df['category_id'], prefix='category')
        brand_dummies = pd.get_dummies(features_df['brand_id'], prefix='brand')
        
        # Combine all features
        features_matrix = pd.concat([
            category_dummies,
            brand_dummies
        ], axis=1)
        
        # Calculate cosine similarity
        self.product_similarity_matrix = cosine_similarity(features_matrix)

    def get_similar_users(self, user_id, n=10):
        if user_id not in self.user_to_index:
            return []

        user_index = self.user_to_index[user_id]
        similarities = self.similarity_matrix[user_index]

        similar_user_indices = np.argsort(similarities)[::-1][1:n + 1]

        similar_users = [
            (self.index_to_user[idx], similarities[idx])
            for idx in similar_user_indices
        ]

        return similar_users

    def get_collaborative_recommendations(self, user_id, n=10):
        similar_users = self.get_similar_users(user_id)
        
        recommendations = []
        user_wishlist = self.wishlist_df[
            self.wishlist_df["userId"] == user_id
        ]["productId"].tolist()

        for similar_user_id, similarity in similar_users:
            similar_user_wishlist = self.wishlist_df[
                self.wishlist_df["userId"] == similar_user_id
            ]["productId"].tolist()

            for product_id in similar_user_wishlist:
                if product_id not in user_wishlist and product_id not in recommendations:
                    recommendations.append((product_id, similarity))
                if len(recommendations) >= n * 2:
                    break
            if len(recommendations) >= n * 2:
                break

        return sorted(recommendations, key=lambda x: x[1], reverse=True)[:n]

    def get_content_based_recommendations(self, user_id, n=10):
        if user_id not in self.user_to_index:
            return []

        user_index = self.user_to_index[user_id]
        user_interests = self.user_interests_df[self.user_interests_df['user_id'] == user_id]['category_id'].tolist()
        
        # Get products from user's interested categories
        category_products = self.products_df[self.products_df['category_id'].isin(user_interests)]
        
        # Get user's wishlist products
        user_wishlist = self.wishlist_df[self.wishlist_df['userId'] == user_id]['productId'].tolist()
        
        # Get similar products to wishlist items
        similar_products = []
        for product_id in user_wishlist:
            if product_id in self.product_to_index:
                product_index = self.product_to_index[product_id]
                similar_indices = np.argsort(self.product_similarity_matrix[product_index])[::-1][1:6]
                similar_products.extend([self.index_to_product[idx] for idx in similar_indices])
        
        # Combine and remove duplicates
        recommendations = list(set(similar_products + category_products['id'].tolist()))
        
        # Remove products already in wishlist
        recommendations = [p for p in recommendations if p not in user_wishlist]
        
        return recommendations[:n]

    def build_hybrid_recommendations(self, user_id, n=20):
        # Get recommendations from different sources
        collaborative_recs = self.get_collaborative_recommendations(user_id, n)
        content_recs = self.get_content_based_recommendations(user_id, n)
        
        # Combine and score recommendations
        recommendation_scores = defaultdict(float)
        
        # Weight for different recommendation sources
        weights = {
            'collaborative': 0.6,  # Increased weight for collaborative filtering
            'content': 0.4        # Increased weight for content-based filtering
        }
        
        # Add collaborative recommendations
        for product_id, similarity in collaborative_recs:
            recommendation_scores[product_id] += weights['collaborative'] * similarity
        
        # Add content-based recommendations
        for product_id in content_recs:
            recommendation_scores[product_id] += weights['content']
        
        # Sort and return top recommendations
        sorted_recommendations = sorted(
            recommendation_scores.items(),
            key=lambda x: x[1],
            reverse=True
        )[:n]
        
        return [product_id for product_id, _ in sorted_recommendations]

    def get_category_details(self, category_ids):
        category_info = [
            self.categories_df[self.categories_df["category_id"] == category_id].to_dict(orient='records')[0]
            for category_id in category_ids
            if not self.categories_df[self.categories_df["category_id"] == category_id].empty
        ]
        return category_info

    def get_suggested_categories(self, user_id, n=5):
        recommended_products = self.build_hybrid_recommendations(user_id)
        recommended_product_categories = set()

        for product_id in recommended_products:
            product_info = self.products_df[self.products_df["product_id"] == product_id]
            if not product_info.empty:
                recommended_product_categories.add(product_info["category_id"].iloc[0])

        similar_users = self.get_similar_users(user_id)
        similar_categories = set()

        for similar_user_id, _ in similar_users:
            user_categories = self.user_interests_df[
                self.user_interests_df["user_id"] == similar_user_id
            ]["category_id"].tolist()
            similar_categories.update(user_categories)

        suggested_categories = self.get_category_details(recommended_product_categories.union(similar_categories))

        return suggested_categories

    def train(self):
        # print("Loading data...")
        self.loadData()
        # print("Building user-item matrix...")
        self.build_user_item_matrix()
        # print("Building product similarity matrix...")
        self.build_product_similarity_matrix()
        # print("Building user similarity matrix...")
        self.similarity_matrix = cosine_similarity(self.user_item_matrix)
        # print("Training completed!")

    def get_product_details(self, product_ids):
        products = [
            self.products_df[self.products_df["product_id"] == product_id].to_dict(orient='records')[0]
            for product_id in product_ids
            if not self.products_df[self.products_df["product_id"] == product_id].empty
        ]
        return products

    def save_model(self, file):
        model_data = {
            "categories_df": self.categories_df,
            "users_df": self.users_df,
            "products_df": self.products_df,
            "user_interests_df": self.user_interests_df,
            "wishlist_df": self.wishlist_df,
            "user_item_matrix": self.user_item_matrix,
            "similarity_matrix": self.similarity_matrix,
            "product_similarity_matrix": self.product_similarity_matrix,
            "user_to_index": self.user_to_index,
            "index_to_user": self.index_to_user,
            "product_to_index": self.product_to_index,
            "index_to_product": self.index_to_product
        }

        with open(file, 'wb') as f:
            pickle.dump(model_data, f)

    def load_model(self, file):
        try:
            with open(file, 'rb') as f:
                model_data = pickle.load(f)

            self.categories_df = model_data['categories_df']
            self.users_df = model_data['users_df']
            self.products_df = model_data['products_df']
            self.user_interests_df = model_data["user_interests_df"]
            self.wishlist_df = model_data["wishlist_df"]
            self.user_item_matrix = model_data["user_item_matrix"]
            self.similarity_matrix = model_data["similarity_matrix"]
            self.product_similarity_matrix = model_data["product_similarity_matrix"]
            self.user_to_index = model_data["user_to_index"]
            self.index_to_user = model_data["index_to_user"]
            self.product_to_index = model_data["product_to_index"]
            self.index_to_product = model_data["index_to_product"]

            return True
        except Exception as e:
            # print(f"Error loading model: {e}")
            return False

    def recommend(self, user_id, n=20):
        try:
            recommended_product_ids = self.build_hybrid_recommendations(user_id, n)
            # Convert numpy integers to plain Python integers
            return [int(x) for x in recommended_product_ids]
        except Exception as e:
            # print(f"Error in recommendation: {e}")
            return []

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python model.py <user_id> [num_recommendations]")
        sys.exit(1)

    user_id = int(sys.argv[1])
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 20

    engine = RecommendationEngine()
    
    # Try to load existing model
    if not engine.load_model("model.pkl"):
        # print("Training new model...")
        engine.train()
        engine.save_model("model.pkl")
    
    recommendations = engine.recommend(user_id, n)
    (recommendations)