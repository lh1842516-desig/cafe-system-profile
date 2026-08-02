'use strict';

/**
 * cafeRepository.js — Supabase Single Source of Truth
 */

const { getClient } = require('../lib/supabase');
const { v4: uuidv4 } = require('uuid');

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
  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('cafes')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('[cafeRepository] getCafes error:', error.message);
      return [];
    }
    return (data || []).map(mapCafeFromDb);
  } catch (err) {
    console.error('[cafeRepository] getCafes exception:', err.message);
    return [];
  }
}

async function getCafeById(id) {
  const normId = String(id || '').trim();
  if (!normId) return null;

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('cafes')
      .select('*')
      .eq('id', normId)
      .limit(1);

    if (error) {
      console.error('[cafeRepository] getCafeById error:', error.message);
      return null;
    }
    if (data && data.length > 0) {
      return mapCafeFromDb(data[0]);
    }
    return null;
  } catch (err) {
    console.error('[cafeRepository] getCafeById exception:', err.message);
    return null;
  }
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

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('cafes')
      .insert([newCafe])
      .select('*');

    if (error) {
      console.error('[cafeRepository] createCafe error:', error.message);
      return mapCafeFromDb(newCafe);
    }
    if (data && data.length > 0) {
      return mapCafeFromDb(data[0]);
    }
  } catch (err) {
    console.error('[cafeRepository] createCafe exception:', err.message);
    return mapCafeFromDb(newCafe);
  }

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

  try {
    const supabase = getClient();
    const { data, error } = await supabase
      .from('cafes')
      .update(updateFields)
      .eq('id', normId)
      .select('*');

    if (error) {
      console.error('[cafeRepository] updateCafe error:', error.message);
      return null;
    }
    if (data && data.length > 0) {
      return mapCafeFromDb(data[0]);
    }
  } catch (err) {
    console.error('[cafeRepository] updateCafe exception:', err.message);
    return null;
  }

  return null;
}

async function deleteCafe(id) {
  const normId = String(id || '').trim();
  if (!normId) return false;

  try {
    const supabase = getClient();
    const { error } = await supabase
      .from('cafes')
      .delete()
      .eq('id', normId);

    if (error) {
      console.error('[cafeRepository] deleteCafe error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[cafeRepository] deleteCafe exception:', err.message);
    return false;
  }
}

module.exports = {
  getCafes,
  getCafeById,
  createCafe,
  updateCafe,
  deleteCafe,
};
