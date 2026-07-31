'use strict';

/**
 * userRepository.js
 * Manages user records for SaaS (Supabase) and Local Mode (local JSON file fallback).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getClient } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

const USERS_FILE = path.join(config.DATA_DIR, 'users.json');

function ensureUsersFile() {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function readLocalUsers() {
  ensureUsersFile();
  try {
    const content = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(content) || [];
  } catch (err) {
    console.error('[userRepository] Error reading local users:', err.message);
    return [];
  }
}

function writeLocalUsers(users) {
  ensureUsersFile();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[userRepository] Error writing local users:', err.message);
    return false;
  }
}

function mapUserFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    cafeId: row.cafe_id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    plainPassword: row.plain_password || row.plainPassword || '',
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getUserByEmail(cafeId, email) {
  const normEmail = String(email || '').trim().toLowerCase();
  if (!normEmail) return null;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', normEmail)
        .limit(1);

      if (error) {
        console.error('[userRepository] getUserByEmail error:', error.message);
        // Fallback to local
        return getLocalUserByEmail(cafeId, normEmail);
      }
      if (data && data.length > 0) {
        return mapUserFromDb(data[0]);
      }
      return null;
    } catch (err) {
      console.error('[userRepository] getUserByEmail exception:', err.message);
      return getLocalUserByEmail(cafeId, normEmail);
    }
  }

  return getLocalUserByEmail(cafeId, normEmail);
}

async function getUserById(cafeId, id) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', normId)
        .limit(1);

      if (error) {
        console.error('[userRepository] getUserById error:', error.message);
        return getLocalUserById(cafeId, normId);
      }
      if (data && data.length > 0) {
        return mapUserFromDb(data[0]);
      }
      return null;
    } catch (err) {
      console.error('[userRepository] getUserById exception:', err.message);
      return getLocalUserById(cafeId, normId);
    }
  }

  return getLocalUserById(cafeId, normId);
}

async function createUser(cafeId, userData) {
  const newUser = {
    id: userData.id || uuidv4(),
    cafe_id: cafeId || null,
    full_name: String(userData.fullName || '').trim(),
    email: String(userData.email || '').trim().toLowerCase(),
    password_hash: String(userData.passwordHash || ''),
    plain_password: String(userData.plainPassword || userData.password || ''),
    role: String(userData.role || 'CASHIER').toUpperCase(),
    status: String(userData.status || 'active').toLowerCase(),
    created_at: userData.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { plain_password, ...dbUser } = newUser;
      const { data, error } = await supabase
        .from('users')
        .insert([dbUser])
        .select('*');

      if (error) {
        console.error('[userRepository] createUser error:', error.message);
        // Fallback to local
        saveLocalUser(newUser);
        return mapUserFromDb(newUser);
      }
      saveLocalUser(newUser);
      if (data && data.length > 0) {
        return mapUserFromDb({ ...data[0], plain_password: newUser.plain_password });
      }
    } catch (err) {
      console.error('[userRepository] createUser exception:', err.message);
      saveLocalUser(newUser);
      return mapUserFromDb(newUser);
    }
  }

  saveLocalUser(newUser);
  return mapUserFromDb(newUser);
}

// Local helpers
function getLocalUserByEmail(cafeId, email) {
  const users = readLocalUsers();
  const user = users.find((u) => String(u.email || '').toLowerCase() === email);
  return user ? mapUserFromDb(user) : null;
}

function getLocalUserById(cafeId, id) {
  const users = readLocalUsers();
  const user = users.find((u) => String(u.id) === id);
  return user ? mapUserFromDb(user) : null;
}

function saveLocalUser(rawUser) {
  const users = readLocalUsers();
  const idx = users.findIndex((u) => u.id === rawUser.id || (rawUser.email && u.email === rawUser.email));
  if (idx !== -1) {
    users[idx] = Object.assign({}, users[idx], rawUser, { updated_at: new Date().toISOString() });
  } else {
    users.push(rawUser);
  }
  writeLocalUsers(users);
}

async function getAllUsers() {
  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[userRepository] getAllUsers error:', error.message);
        return readLocalUsers().map(mapUserFromDb);
      }
      const localUsers = readLocalUsers();
      return (data || []).map(dbRow => {
        const matchedLocal = localUsers.find(l => String(l.id) === String(dbRow.id));
        const plainPassword = matchedLocal ? (matchedLocal.plain_password || matchedLocal.plainPassword || '') : '';
        return mapUserFromDb({ ...dbRow, plain_password: plainPassword || dbRow.plain_password });
      });
    } catch (err) {
      console.error('[userRepository] getAllUsers exception:', err.message);
      return readLocalUsers().map(mapUserFromDb);
    }
  }

  return readLocalUsers().map(mapUserFromDb);
}

async function updateUser(id, userData) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  const updateFields = {
    updated_at: new Date().toISOString()
  };
  if (userData.fullName !== undefined) updateFields.full_name = String(userData.fullName).trim();
  if (userData.email !== undefined) updateFields.email = String(userData.email).trim().toLowerCase();
  if (userData.passwordHash !== undefined) updateFields.password_hash = String(userData.passwordHash);
  if (userData.plainPassword !== undefined) updateFields.plain_password = String(userData.plainPassword);
  if (userData.role !== undefined) updateFields.role = String(userData.role).trim().toUpperCase();
  if (userData.status !== undefined) updateFields.status = String(userData.status).trim().toLowerCase();
  if (userData.cafeId !== undefined) updateFields.cafe_id = userData.cafeId || null;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { plain_password, ...dbUpdateFields } = updateFields;
      const { data, error } = await supabase
        .from('users')
        .update(dbUpdateFields)
        .eq('id', normId)
        .select('*');

      if (error) {
        console.error('[userRepository] updateUser error:', error.message);
        const local = updateLocalUser(normId, updateFields);
        return mapUserFromDb(local);
      }
      const local = updateLocalUser(normId, updateFields);
      if (data && data.length > 0) {
        return mapUserFromDb({ ...data[0], plain_password: local.plain_password });
      }
    } catch (err) {
      console.error('[userRepository] updateUser exception:', err.message);
      const local = updateLocalUser(normId, updateFields);
      return mapUserFromDb(local);
    }
  }

  const local = updateLocalUser(normId, updateFields);
  return mapUserFromDb(local);
}

async function deleteUser(id) {
  const normId = String(id || '').trim();
  if (!normId) return false;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', normId);

      if (error) {
        console.error('[userRepository] deleteUser error:', error.message);
        return deleteLocalUser(normId);
      }
      return true;
    } catch (err) {
      console.error('[userRepository] deleteUser exception:', err.message);
      return deleteLocalUser(normId);
    }
  }

  return deleteLocalUser(normId);
}

function updateLocalUser(id, fields) {
  const users = readLocalUsers();
  const idx = users.findIndex((u) => String(u.id) === id);
  if (idx !== -1) {
    users[idx] = Object.assign({}, users[idx], fields);
    writeLocalUsers(users);
    return users[idx];
  }
  return null;
}

function deleteLocalUser(id) {
  const users = readLocalUsers();
  const filtered = users.filter((u) => String(u.id) !== id);
  if (filtered.length !== users.length) {
    writeLocalUsers(filtered);
    return true;
  }
  return false;
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  getAllUsers,
  updateUser,
  deleteUser,
};
