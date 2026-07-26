const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '7d';

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Falta SESSION_SECRET en las variables de entorno.');
  }
  return secret;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken({ username, role }) {
  return jwt.sign({ username, role }, getSecret(), { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, getSecret());
    return { username: payload.username, role: payload.role };
  } catch (e) {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
