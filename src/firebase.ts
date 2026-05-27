// Highly resilient localStorage-backed local snapshot layer to replace Firebase Cloud DB and Auth
// after declining Firebase setup. This ensures the app operates smoothly with 0% risk of connection failure.

export interface User {
  uid: string;
  displayName: string | null;
  email: string | null;
}

// Global In-Memory state & event emitter
const snapshotListeners: Map<string, Set<(snapshot: any) => void>> = new Map();
const authListeners: Set<(user: User | null) => void> = new Set();
let currentUser: User | null = null;

// Initialize user from localStorage if it exists
try {
  const savedUser = localStorage.getItem('trustpilot_collector_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  }
} catch (e) {
  console.warn("Could not load stored user session:", e);
}

// Callback notification helper for Collections
const notifyCollectionListeners = (collectionName: string) => {
  const listeners = snapshotListeners.get(collectionName);
  if (listeners) {
    const snapshot = getCollectionSnapshot(collectionName);
    listeners.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.error(`Error in snapshot subscriber for ${collectionName}:`, err);
      }
    });
  }
};

const getCollectionSnapshot = (collectionName: string) => {
  const storageKey = `local_db_${collectionName}`;
  let dataMap: Record<string, any> = {};
  
  try {
    const text = localStorage.getItem(storageKey);
    if (text) {
      dataMap = JSON.parse(text);
    }
  } catch (_) {
    dataMap = {};
  }
  
  const docs = Object.keys(dataMap).map((id) => {
    const docData = dataMap[id];
    return {
      id,
      data: () => docData,
    };
  });
  
  return {
    docs,
  };
};

// -- Mock Firebase Auth exports --
export const auth = {
  currentUser: currentUser,
};

export class GoogleAuthProvider {}
export const googleProvider = new GoogleAuthProvider();

export const signInAnonymously = async (authObj?: any) => {
  currentUser = {
    uid: "guest_session_" + Math.random().toString(36).substring(2, 9),
    displayName: "Workspace Guest",
    email: "guest@workspace.local"
  };
  localStorage.setItem('trustpilot_collector_user', JSON.stringify(currentUser));
  authListeners.forEach(cb => cb(currentUser));
  return { user: currentUser };
};

export const signInWithPopup = async () => {
  return signInAnonymously();
};

export const signOut = async (authObj?: any) => {
  currentUser = null;
  localStorage.removeItem('trustpilot_collector_user');
  authListeners.forEach(cb => cb(null));
};

export const onAuthStateChanged = (authObj: any, callback: (user: User | null) => void) => {
  // Callback with initial user immediately
  setTimeout(() => {
    callback(currentUser);
  }, 0);
  authListeners.add(callback);
  return () => {
    authListeners.delete(callback);
  };
};

// -- Mock Firestore exports --
class MockFirestore {}
export const db = new MockFirestore();

export const collection = (dbInstance: any, collectionName: string) => {
  return { type: 'collection', path: collectionName };
};

export const doc = (dbOrCol: any, ...paths: string[]) => {
  let collectionName = '';
  let id = '';
  if (dbOrCol && dbOrCol.type === 'collection') {
    collectionName = dbOrCol.path;
    id = paths[0];
  } else {
    collectionName = paths[0];
    id = paths[1];
  }
  return { type: 'document', collectionName, id };
};

export const query = (colRef: any, ...constraints: any[]) => {
  return { type: 'query', collectionName: colRef.path };
};

export const where = (field: string, op: string, value: any) => {
  return { type: 'where', field, op, value };
};

export const setDoc = async (docRef: any, data: any) => {
  const colName = docRef.collectionName;
  const docId = docRef.id;
  
  const storageKey = `local_db_${colName}`;
  let currentData: Record<string, any> = {};
  
  try {
    const text = localStorage.getItem(storageKey);
    if (text) {
      currentData = JSON.parse(text);
    }
  } catch (_) {}
  
  currentData[docId] = data;
  localStorage.setItem(storageKey, JSON.stringify(currentData));
  
  // Trigger reactive updates
  notifyCollectionListeners(colName);
};

export const getDoc = async (docRef: any) => {
  const colName = docRef.collectionName;
  const docId = docRef.id;
  
  const storageKey = `local_db_${colName}`;
  let currentData: Record<string, any> = {};
  
  try {
    const text = localStorage.getItem(storageKey);
    if (text) {
      currentData = JSON.parse(text);
    }
  } catch (_) {}
  
  const exists = docId in currentData;
  return {
    exists: () => exists,
    data: () => currentData[docId] || null,
    id: docId,
  };
};

export const deleteDoc = async (docRef: any) => {
  const colName = docRef.collectionName;
  const docId = docRef.id;
  
  const storageKey = `local_db_${colName}`;
  let currentData: Record<string, any> = {};
  
  try {
    const text = localStorage.getItem(storageKey);
    if (text) {
      currentData = JSON.parse(text);
    }
  } catch (_) {}
  
  if (docId in currentData) {
    delete currentData[docId];
    localStorage.setItem(storageKey, JSON.stringify(currentData));
    notifyCollectionListeners(colName);
  }
};

export const getDocs = async (queryOrColRef: any) => {
  const colName = queryOrColRef.collectionName || queryOrColRef.path;
  return getCollectionSnapshot(colName);
};

export const getDocFromServer = async (docRef: any) => {
  return getDoc(docRef);
};

export const onSnapshot = (
  queryOrColRef: any, 
  callback: (snapshot: any) => void, 
  errorCallback?: (err: any) => void
) => {
  const colName = queryOrColRef.collectionName || queryOrColRef.path;
  
  if (!snapshotListeners.has(colName)) {
    snapshotListeners.set(colName, new Set());
  }
  snapshotListeners.get(colName)!.add(callback);
  
  // Deliver initial state immediately
  try {
    const initialSnapshot = getCollectionSnapshot(colName);
    setTimeout(() => {
      callback(initialSnapshot);
    }, 0);
  } catch (err) {
    if (errorCallback) {
      errorCallback(err);
    }
  }
  
  // Return unsubscribing function
  return () => {
    const listeners = snapshotListeners.get(colName);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        snapshotListeners.delete(colName);
      }
    }
  };
};

// Mock Timestamp
export const Timestamp = {
  now: () => ({ 
    toMillis: () => Date.now(), 
    toDate: () => new Date(),
    seconds: Math.floor(Date.now() / 1000),
    nanoseconds: 0
  }),
  fromDate: (date: Date) => ({ 
    toMillis: () => date.getTime(), 
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    nanoseconds: 0
  })
};
