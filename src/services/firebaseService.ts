import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where,
  updateDoc,
  addDoc,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Transformer, Alert, OperationType } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth();

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseService = {
  async testConnection() {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if(error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  },

  async login() {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  },

  async addTransformer(transformer: Transformer) {
    const path = `transformers/${transformer.id}`;
    try {
      await setDoc(doc(db, 'transformers', transformer.id), transformer);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  listenTransformers(callback: (transformers: Transformer[]) => void) {
    const user = auth.currentUser;
    if (!user) return () => {};
    
    const path = 'transformers';
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    
    return onSnapshot(q, (snapshot) => {
      const transformers = snapshot.docs.map(doc => doc.data() as Transformer);
      callback(transformers);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
  },

  async updateTransformer(id: string, updates: Partial<Transformer>) {
    const path = `transformers/${id}`;
    try {
      await updateDoc(doc(db, 'transformers', id), updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  },

  async createAlert(alert: Omit<Alert, 'id'>) {
    const path = 'alerts';
    try {
      const docRef = await addDoc(collection(db, path), {
        ...alert,
        createdAt: new Date().toISOString(),
        isRead: false
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
};
