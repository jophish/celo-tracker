
export enum StorageKey {
  Address = 'Address'
}

export function saveValue(key: StorageKey, value: any) {
  localStorage.setItem(key, value)
}

export function readValue(key: StorageKey) {
  return localStorage.getItem(key)
}

export function clearSavedItem(key: StorageKey) {
  localStorage.removeItem(key)
}
