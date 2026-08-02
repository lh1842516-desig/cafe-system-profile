'use strict';

/**
 * userRepository.js — Supabase Single Source of Truth
 */

const { getClient } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

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

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normEmail)
      .limit(1);

    if (error) {
      console.error('[userRepository] getUserByEmail error:', error.message);
      return null;
    }
    if (data && data.length > 0) {
      return mapUserFromDb(data[0]);
    }
    return null;
  } catch (err) {
    console.error('[userRepository] getUserByEmail exception:', err.message);
    return null;
  }
}

async function getUserById(cafeId, id) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', normId)
      .limit(1);

    if (error) {
      console.error('[userRepository] getUserById error:', error.message);
      return null;
    }
    if (data && data.length > 0) {
      return mapUserFromDb(data[0]);
    }
    return null;
  } catch (err) {
    console.error('[userRepository] getUserById exception:', err.message);
    return null;
  }
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

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .insert([newUser])
      .select('*');

    if (error) {
      console.error('[userRepository] createUser error:', error.message);
      return mapUserFromDb(newUser);
    }
    if (data && data.length > 0) {
      return mapUserFromDb(data[0]);
    }
  } catch (err) {
    console.error('[userRepository] createUser exception:', err.message);
    return mapUserFromDb(newUser);
  }

  return mapUserFromDb(newUser);
}

async function getAllUsers() {
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[userRepository] getAllUsers error:', error.message);
      return [];
    }
    return (data || []).map(mapUserFromDb);
  } catch (err) {
    console.error('[userRepository] getAllUsers exception:', err.message);
    return [];
  }
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

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .update(updateFields)
      .eq('id', normId)
      .select('*');

    if (error) {
      console.error('[userRepository] updateUser error:', error.message);
      return null;
    }
    if (data && data.length > 0) {
      return mapUserFromDb(data[0]);
    }
  } catch (err) {
    console.error('[userRepository] updateUser exception:', err.message);
    return null;
  }

  return null;
}

async function deleteUser(id) {
  const normId = String(id || '').trim();
  if (!normId) return false;

  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', normId);

    if (error) {
      console.error('[userRepository] deleteUser error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[userRepository] deleteUser exception:', err.message);
    return false;
  }
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  getAllUsers,
  updateUser,
  deleteUser,
};
