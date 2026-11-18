// The only file that talks to Firebase. The settings below are public by design:
// the database rules are what keep the data private.
const VERSION = '12.18.0';
export const SDK_BASE = `https://www.gstatic.com/firebasejs/${VERSION}/`;
const firebaseConfig = {
  apiKey: 'AIzaSyBcO7BK7nZNXT0q8Hrnuoc35PgtX8sYsf8',
  authDomain: 'home-7cc96.firebaseapp.com',
  projectId: 'home-7cc96',
  storageBucket: 'home-7cc96.firebasestorage.app',
  messagingSenderId: '358418694105',
  appId: '1:358418694105:web:5ebe1594649b8fcf95a3c8',
};
const ROOT = ['households', 'home'];

export async function connect() {
  const [A, U, F] = await Promise.all(['app', 'auth', 'firestore'].map(n => import(/* @vite-ignore */ `${SDK_BASE}firebase-${n}.js`)));
  const app = A.initializeApp(firebaseConfig);
  const auth = U.getAuth(app);
  const db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  const colRef = name => F.collection(db, ...ROOT, name);
  const docRef = (name, id) => F.doc(db, ...ROOT, name, id);
  const rows = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const meta = snap => ({ fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
  U.getRedirectResult(auth).catch(() => {});
  return {
    onUser: cb => U.onAuthStateChanged(auth, cb),
    async signIn() {
      const provider = new U.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try { await U.signInWithPopup(auth, provider); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return U.signInWithRedirect(auth, provider);
        throw e;
      }
    },
    signOut: () => U.signOut(auth),
    listen(name, cb, onError, sinceMs) {
      const q = sinceMs ? F.query(colRef(name), F.where('at', '>=', sinceMs)) : colRef(name);
      return F.onSnapshot(q, { includeMetadataChanges: true }, s => cb(rows(s), meta(s)), onError);
    },
    listenDoc(name, id, cb, onError) {
      return F.onSnapshot(docRef(name, id), { includeMetadataChanges: true }, s => cb(s.exists() ? s.data() : null, meta(s)), onError);
    },
    async getAll(name) { return rows(await F.getDocs(colRef(name))); },
    async getOlder(name, beforeMs, count) {
      return rows(await F.getDocs(F.query(colRef(name), F.where('at', '<', beforeMs), F.orderBy('at', 'desc'), F.limit(count))));
    },
    /** ops: [{type:'set'|'update'|'delete', col, id, data}]. Queued on the phone straight away, sent when online. */
    write(ops) {
      const out = [];
      for (let i = 0; i < ops.length; i += 400) {
        const b = F.writeBatch(db);
        for (const o of ops.slice(i, i + 400)) {
          const r = docRef(o.col, o.id);
          if (o.type === 'set') b.set(r, o.data, o.merge ? { merge: true } : {});
          else if (o.type === 'update') b.update(r, o.data);
          else b.delete(r);
        }
        out.push(b.commit());
      }
      return Promise.all(out);
    },
  };
}
