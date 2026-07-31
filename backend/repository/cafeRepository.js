'use strict';

/**
 * cafeRepository.js
 * Manages cafe records for SaaS (Supabase) and Local Mode (local JSON file fallback).
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getClient } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

const CAFES_FILE = path.join(config.DATA_DIR, 'cafes.json');

function ensureCafesFile() {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(CAFES_FILE)) {
    fs.writeFileSync(CAFES_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function readLocalCafes() {
  ensureCafesFile();
  try {
    const content = fs.readFileSync(CAFES_FILE, 'utf8');
    return JSON.parse(content) || [];
  } catch (err) {
    console.error('[cafeRepository] Error reading local cafes:', err.message);
    return [];
  }
}

function writeLocalCafes(cafes) {
  ensureCafesFile();
  try {
    fs.writeFileSync(CAFES_FILE, JSON.stringify(cafes, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[cafeRepository] Error writing local cafes:', err.message);
    return false;
  }
}

function mapCafeFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    address: row.address || '',
    phone: row.phone || '',
    subscriptionStatus: row.subscription_status || 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getCafes() {
  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('cafes')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('[cafeRepository] getCafes error:', error.message);
        return readLocalCafes().map(mapCafeFromDb);
      }
      return (data || []).map(mapCafeFromDb);
    } catch (err) {
      console.error('[cafeRepository] getCafes exception:', err.message);
      return readLocalCafes().map(mapCafeFromDb);
    }
  }

  return readLocalCafes().map(mapCafeFromDb);
}

async function getCafeById(id) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('cafes')
        .select('*')
        .eq('id', normId)
        .limit(1);

      if (error) {
        console.error('[cafeRepository] getCafeById error:', error.message);
        return mapCafeFromDb(readLocalCafes().find(c => String(c.id) === normId));
      }
      if (data && data.length > 0) {
        return mapCafeFromDb(data[0]);
      }
      return null;
    } catch (err) {
      console.error('[cafeRepository] getCafeById exception:', err.message);
      return mapCafeFromDb(readLocalCafes().find(c => String(c.id) === normId));
    }
  }

  return mapCafeFromDb(readLocalCafes().find(c => String(c.id) === normId));
}

async function createCafe(cafeData) {
  const id = cafeData.id || uuidv4();
  const name = String(cafeData.name || 'My Cafe').trim();
  const slug = String(cafeData.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
  const newCafe = {
    id,
    name,
    slug,
    logo_url: cafeData.logoUrl || null,
    address: String(cafeData.address || '').trim(),
    phone: String(cafeData.phone || '').trim(),
    subscription_status: String(cafeData.subscriptionStatus || 'active').toLowerCase(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('cafes')
        .insert([newCafe])
        .select('*');

      if (error) {
        console.error('[cafeRepository] createCafe error:', error.message);
        saveLocalCafe(newCafe);
        return mapCafeFromDb(newCafe);
      }
      if (data && data.length > 0) {
        return mapCafeFromDb(data[0]);
      }
    } catch (err) {
      console.error('[cafeRepository] createCafe exception:', err.message);
      saveLocalCafe(newCafe);
      return mapCafeFromDb(newCafe);
    }
  }

  saveLocalCafe(newCafe);
  return mapCafeFromDb(newCafe);
}

async function updateCafe(id, cafeData) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  const updateFields = {
    updated_at: new Date().toISOString()
  };
  if (cafeData.name !== undefined) updateFields.name = String(cafeData.name).trim();
  if (cafeData.slug !== undefined) updateFields.slug = String(cafeData.slug).trim();
  if (cafeData.logoUrl !== undefined) updateFields.logo_url = cafeData.logoUrl || null;
  if (cafeData.address !== undefined) updateFields.address = String(cafeData.address).trim();
  if (cafeData.phone !== undefined) updateFields.phone = String(cafeData.phone).trim();
  if (cafeData.subscriptionStatus !== undefined) {
    updateFields.subscription_status = String(cafeData.subscriptionStatus).trim().toLowerCase();
  }

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { data, error } = await supabase
        .from('cafes')
        .update(updateFields)
        .eq('id', normId)
        .select('*');

      if (error) {
        console.error('[cafeRepository] updateCafe error:', error.message);
        const local = updateLocalCafe(normId, updateFields);
        return mapCafeFromDb(local);
      }
      if (data && data.length > 0) {
        return mapCafeFromDb(data[0]);
      }
    } catch (err) {
      console.error('[cafeRepository] updateCafe exception:', err.message);
      const local = updateLocalCafe(normId, updateFields);
      return mapCafeFromDb(local);
    }
  }

  const local = updateLocalCafe(normId, updateFields);
  return mapCafeFromDb(local);
}

async function deleteCafe(id) {
  const normId = String(id || '').trim();
  if (!normId) return false;

  if (config.SAAS_AUTH_ENABLED) {
    try {
      const supabase = getClient();
      const { error } = await supabase
        .from('cafes')
        .delete()
        .eq('id', normId);

      if (error) {
        console.error('[cafeRepository] deleteCafe error:', error.message);
        return deleteLocalCafe(normId);
      }
      return true;
    } catch (err) {
      console.error('[cafeRepository] deleteCafe exception:', err.message);
      return deleteLocalCafe(normId);
    }
  }

  return deleteLocalCafe(normId);
}

// Local Helpers
function saveLocalCafe(rawCafe) {
  const cafes = readLocalCafes();
  const idx = cafes.findIndex(c => c.id === rawCafe.id);
  if (idx !== -1) {
    cafes[idx] = Object.assign({}, cafes[idx], rawCafe);
  } else {
    cafes.push(rawCafe);
  }
  writeLocalCafes(cafes);
}

function updateLocalCafe(id, fields) {
  const cafes = readLocalCafes();
  const idx = cafes.findIndex(c => String(c.id) === id);
  if (idx !== -1) {
    cafes[idx] = Object.assign({}, cafes[idx], fields);
    writeLocalCafes(cafes);
    return cafes[idx];
  }
  return null;
}

function deleteLocalCafe(id) {
  const cafes = readLocalCafes();
  const filtered = cafes.filter(c => String(c.id) !== id);
  if (filtered.length !== cafes.length) {
    writeLocalCafes(filtered);
    return true;
  }
  return false;
}

module.exports = {
  getCafes,
  getCafeById,
  createCafe,
  updateCafe,
  deleteCafe,
};
