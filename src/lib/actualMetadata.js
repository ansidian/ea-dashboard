import { getActualMetadata } from "../api.js";

// Shared Actual Budget metadata cache — single fetch for accounts, payees, categories
let _metadataCache = null;
let _metadataFetching = false;
let _metadataListeners = [];

export function ensureMetadataLoaded(callback) {
  if (_metadataCache) { callback(_metadataCache); return; }
  _metadataListeners.push(callback);
  if (_metadataFetching) return;
  _metadataFetching = true;
  getActualMetadata()
    .then(data => {
      // Flatten grouped categories into a flat list
      const flatCategories = [];
      for (const g of data.categories || []) {
        for (const c of g.categories) {
          flatCategories.push({ id: c.id, name: c.name, group: g.group_name });
        }
      }
      _metadataCache = { accounts: data.accounts || [], payees: data.payees || [], categories: flatCategories };
      _metadataListeners.forEach(fn => fn(_metadataCache));
    })
    .catch(() => {
      const empty = { accounts: [], payees: [], categories: [] };
      _metadataListeners.forEach(fn => fn(empty));
    })
    .finally(() => { _metadataFetching = false; _metadataListeners = []; });
}

export { _metadataCache };
