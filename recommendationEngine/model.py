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

    def connect_db(self):
        return psycopg2.connect(**self.db_config)
    
    def sampleData(self):
        conn = self.connect_db()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM "Product" ORDER BY RANDOM() LIMIT 400;')
        products = cursor.fetchall()

        return [p[0] for p in products]
    
    def loadData(self):
        conn = self.connect_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users;")
        users = cursor.fetchall()
        self.users_df = pd.DataFrame(users, columns=[desc[0] for desc in cursor.description])
        
        cursor.execute("SELECT * FROM categories;")
        categories = cursor.fetchall()
        self.categories_df = pd.DataFrame(categories, columns=[desc[0] for desc in cursor.description])
        
        cursor.execute("SELECT * FROM products;")
        products = cursor.fetchall()
        self.products_df = pd.DataFrame(products, columns=[desc[0] for desc in cursor.description])
        
        cursor.execute("SELECT * FROM user_intrested_category;")
        user_interests = cursor.fetchall()
        self.user_interests_df = pd.DataFrame(user_interests, columns=[desc[0] for desc in cursor.description])
        
        cursor.execute("SELECT * FROM wishlist;")
        wishlists = cursor.fetchall()
        self.wishlist_df = pd.DataFrame(wishlists, columns=[desc[0] for desc in cursor.description])
        
        cursor.close()
        conn.close()
    
    def build_user_item_matrix(self):
        users = self.users_df["id"].unique()
        products = self.products_df["product_id"].unique()

        self.user_to_index = {user: i for i, user in enumerate(users)}
        self.index_to_user = {i: user for user, i in self.user_to_index.items()}
        self.product_to_index = {product: i for i, product in enumerate(products)}
        self.index_to_product = {i: product for product, i in self.product_to_index.items()}

        rows = []
        cols = []
        data = []

        for _, row in self.wishlist_df.iterrows():
            user_id = row["user_id"]
            product_id = row["product_id"]

            if user_id in self.user_to_index and product_id in self.product_to_index:
                rows.append(self.user_to_index[user_id])
                cols.append(self.product_to_index[product_id])
                data.append(1)

        self.user_item_matrix = sparse.csr_matrix(
            (data, (rows, cols)), shape=(len(users), len(products))
        )

    def build_category_based_recommendation(self):
        self.category_recommendations = defaultdict(list)

        for _, row in self.user_interests_df.iterrows():
            user_id = row["user_id"]
            category_id = row["category_id"]

            category_products = self.products_df[
                self.products_df["category_id"] == category_id
            ]["product_id"].tolist()

            self.category_recommendations[user_id].extend(category_products)

        for user_id in self.category_recommendations:
            user_wishlist = self.wishlist_df[
                self.wishlist_df["user_id"] == user_id
            ]["product_id"].tolist()

            self.category_recommendations[user_id] = [
                product
                for product in self.category_recommendations[user_id]
                if product not in user_wishlist
            ]

    def build_collaborative_filter(self):
        self.similarity_matrix = cosine_similarity(self.user_item_matrix)

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
            self.wishlist_df["user_id"] == user_id
        ]["product_id"].tolist()

        for similar_user_id, similarity in similar_users:
            similar_user_wishlist = self.wishlist_df[
                self.wishlist_df["user_id"] == similar_user_id
            ]["product_id"].tolist()

            for product_id in similar_user_wishlist:
                if product_id not in user_wishlist and product_id not in recommendations:
                    recommendations.append(product_id)
                if len(recommendations) >= n:
                    break
            if len(recommendations) >= n:
                break

        return recommendations

    def build_hybrid_recommendations(self, user_id, n=10, collaborative_weight=0.7, category_weight=0.3):
        collaborative_recommendations = self.get_collaborative_recommendations(user_id, n * 2)

        if user_id in self.category_recommendations:
            category_recommendations = self.category_recommendations[user_id][:n * 2]
        else:
            category_recommendations = []

        recommendation_scores = {}

        for i, product_id in enumerate(collaborative_recommendations):
            score = collaborative_weight * (1.0 - i / len(collaborative_recommendations))
            recommendation_scores[product_id] = recommendation_scores.get(product_id, 0) + score

        for i, product_id in enumerate(category_recommendations):
            score = category_weight * (1.0 - i / len(category_recommendations))
            recommendation_scores[product_id] = recommendation_scores.get(product_id, 0) + score

        sorted_recommendation = sorted(recommendation_scores.items(), key=lambda x: x[1], reverse=True)[:n]

        return [product_id for product_id, _ in sorted_recommendation]

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
        self.loadData()
        self.build_user_item_matrix()
        self.build_category_based_recommendation()
        self.build_collaborative_filter()

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
            "user_to_index": self.user_to_index,
            "index_to_user": self.index_to_user,
            "product_to_index": self.product_to_index,
            "index_to_product": self.index_to_product,
            "category_recommendations": self.category_recommendations
        }

        with open(file, 'wb') as f:
            pickle.dump(model_data, f)

        #print(f"Model saved to {file}")

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
            self.user_to_index = model_data["user_to_index"]
            self.index_to_user = model_data["index_to_user"]
            self.product_to_index = model_data["product_to_index"]
            self.index_to_product = model_data["index_to_product"]
            self.category_recommendations = defaultdict(list, model_data['category_recommendations'])

            #print(f"Model loaded from {file}")
            return True
        except Exception as e:
            #print(f"Error loading model: {e}")
            return False

    def recommend(self, user_id, n=20):
        recommended_product_ids = self.build_hybrid_recommendations(user_id, n=n)
        #products = self.get_product_details(recommended_product_ids)

        return recommended_product_ids


if __name__ == "__main__":
    user_id = int(sys.argv[1])
    num_recommendations = int(sys.argv[2]) if len(sys.argv) > 2 else None
    model = RecommendationEngine()
    '''
    model.train()
    print(model.recommend(38))
    #print(model.get_suggested_categories(38))
    '''

    model_file = "model.pkl"

    # if os.path.exists(model_file):
    #     #print("Loading existing model...")
    #     model.load_model(model_file)
    # else:
    #     #print("Training new model...")
    #     model.train()
    #     model.save_model(model_file)
        
    # if num_recommendations:
    #     result_ids = model.recommend(user_id, num_recommendations)
    # else:
    #     result_ids = model.recommend(user_id)
#    print(json.dumps({"productIds": result_ids}))
    
    print(model.sampleData())
    
    # print(result_ids)
    '''
    def custom_serializer(obj):
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        if isinstance(obj, np.generic):
            return obj.item()  # Convert numpy types to Python scalars
        raise TypeError(f"Type {type(obj)} not serializable")
    print(json.dumps(results, default=str, indent=2))
    '''