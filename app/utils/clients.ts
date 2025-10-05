import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

export async function ensureClientProfile(uid: string, email: string) {
  const { $firestore } = useNuxtApp()
  const ref = doc($firestore, 'clients', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, {
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  } else {
    await updateDoc(ref, {
      email: email || snap.data()?.email || null,
      updatedAt: serverTimestamp()
    })
  }
}


