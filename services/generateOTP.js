const otpGenerator = require("otp-generator");

const generateOtp = (otpLength) => {
  return otpGenerator.generate(otpLength, {
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
    lowerCase: false,
    digits: true,
  });
};

module.exports = generateOtp;
