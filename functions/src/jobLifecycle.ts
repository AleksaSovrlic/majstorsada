import { getFirestore, FieldValue, GeoPoint, Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError } from 'firebase-functions/v2/https'
import { defineBoolean, defineString } from 'firebase-functions/params'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { geohashForLocation } from 'geofire-common'

export interface Actor { uid: string; email?: string; email_verified?: boolean; accountRole?: string }
export type Role = 'admin' | 'tradesperson' | 'client' | 'unregistered'
const writesEnabled = defineBoolean('PUBLIC_WRITES_ENABLED', { default: false })
const imageBucket = defineString('JOB_IMAGES_BUCKET', { default: 'majstorsada-b2ad4.firebasestorage.app' })
const demo = () => (process.env.GCLOUD_PROJECT || '').startsWith('demo-') && !!process.env.FIRESTORE_EMULATOR_HOST
export function requireWritesEnabled() {
  if (!demo() && !writesEnabled.value()) throw new HttpsError('unavailable', 'Kratka pauza zbog ažuriranja. Pokušajte ponovo za nekoliko minuta.')
}
export function object(value: any, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) {
    throw new HttpsError('invalid-argument', 'Zahtev sadrži nedozvoljene podatke.')
  }
}
function text(value: any, min: number, max: number, label: string) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpsError('invalid-argument', `${label} nije ispravno unet.`)
  return value.trim()
}
export function specialization(value: any) {
  if (value === 'elektricar') return 'električar'
  if (!['vodoinstalater', 'električar', 'bravar'].includes(value)) throw new HttpsError('invalid-argument', 'Izaberite podržanu uslugu.')
  return value as string
}
function phone(value: any) {
  const parsed = typeof value === 'string' && value.length <= 30 ? parsePhoneNumberFromString(value, 'RS') : null
  if (!parsed?.isValid()) throw new HttpsError('invalid-argument', 'Molimo unesite ispravan broj telefona.')
  return parsed.number
}
export function jobId(value: any) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new HttpsError('invalid-argument', 'Neispravan identifikator zahteva.')
  return value
}
async function roles(tx: Transaction, uid: string) {
  const db = getFirestore()
  const snapshots = await tx.getAll(...['admins', 'tradespeople', 'clients'].map(c => db.doc(`${c}/${uid}`)))
  const found = snapshots.map((s, i) => s.exists ? (['admin', 'tradesperson', 'client'] as const)[i] : null).filter(Boolean)
  if (found.length > 1) throw new HttpsError('failed-precondition', 'Nalog ima neusaglašene uloge. Kontaktirajte podršku.')
  return { role: (found[0] || 'unregistered') as Role, snapshots }
}
export async function requireRole(uid: string, role: Role) {
  const actual = await getFirestore().runTransaction(tx => roles(tx, uid))
  if (actual.role !== role) throw new HttpsError('permission-denied', 'Vaš nalog nema dozvolu za ovu radnju.')
}
export async function resolveAccount(actor: Actor, data: any) {
  object(data, [])
  const { role } = await getFirestore().runTransaction(tx => roles(tx, actor.uid))
  return { role }
}
export async function completeRegistration(actor: Actor, data: any) {
  requireWritesEnabled()
  object(data, ['role', 'displayName', 'phoneNumber', 'specialization', 'city'])
  if (!['client', 'tradesperson'].includes(data.role)) throw new HttpsError('invalid-argument', 'Neispravna vrsta naloga.')
  if (data.role === 'client' && !actor.email_verified) throw new HttpsError('failed-precondition', 'Prvo potvrdite email adresu linkom za prijavu.')
  const fields = data.role === 'tradesperson' ? {
    displayName: text(data.displayName, 2, 80, 'Ime'), phoneNumber: phone(data.phoneNumber),
    specialization: specialization(data.specialization), city: 'Beograd',
  } : {}
  if (data.role === 'tradesperson' && data.city !== 'Beograd') throw new HttpsError('invalid-argument', 'Trenutno podržavamo samo Beograd.')
  const db = getFirestore()
  await db.runTransaction(async tx => {
    const existing = await roles(tx, actor.uid)
    if (existing.role === data.role) return // Retry never resets tokens, ratings or profile edits.
    if (existing.role !== 'unregistered') throw new HttpsError('already-exists', 'Nalog je već registrovan za drugu ulogu.')
    tx.create(db.doc(`${data.role === 'client' ? 'clients' : 'tradespeople'}/${actor.uid}`), {
      uid: actor.uid, email: actor.email || '', ...fields,
      ...(data.role === 'tradesperson' ? { status: 'unavailable', balanceTokens: 0 } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
  })
  return { role: data.role }
}
export async function createJob(actor: Actor, data: any) {
  requireWritesEnabled()
  object(data, ['requestId', 'problemDescription', 'address', 'coordinates', 'city', 'contactPhone', 'specializationRequired', 'photoCount'])
  const id = jobId(data.requestId)
  object(data.coordinates, ['lat', 'lng'])
  const { lat, lng } = data.coordinates
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 44.60 || lat > 45 || lng < 19.99 || lng > 20.78) throw new HttpsError('invalid-argument', 'Izaberite adresu na podržanom području Beograda.')
  if (data.city !== 'Beograd' || !Number.isInteger(data.photoCount) || data.photoCount < 0 || data.photoCount > 3) throw new HttpsError('invalid-argument', 'Neispravan grad ili broj fotografija.')
  const address = text(data.address, 1, 300, 'Adresa')
  const payload = {
    problemDescription: text(data.problemDescription, 3, 2000, 'Opis problema'), address, location: address,
    coordinates: new GeoPoint(lat, lng), geohash: geohashForLocation([lat, lng]), city: 'Beograd',
    specializationRequired: specialization(data.specializationRequired), photoCount: data.photoCount,
  }
  const contactPhone = phone(data.contactPhone)
  const db = getFirestore(), ref = db.doc(`jobs/${id}`), contact = ref.collection('private').doc('contact')
  const result = await db.runTransaction(async tx => {
    const account = await roles(tx, actor.uid)
    if (account.role !== 'client') throw new HttpsError('permission-denied', 'Samo klijent može da pošalje zahtev.')
    const existing = await tx.get(ref)
    if (existing.exists) {
      const old = existing.data()!
      if (old.clientId !== actor.uid) throw new HttpsError('already-exists', 'Identifikator zahteva je već zauzet.')
      const oldContact = await tx.get(contact)
      const same = old.problemDescription === payload.problemDescription && old.address === address && old.coordinates?.isEqual(payload.coordinates) && old.specializationRequired === payload.specializationRequired && old.photoCount === payload.photoCount && oldContact.data()?.contactPhone === contactPhone
      if (!same) throw new HttpsError('already-exists', 'Ovaj zahtev je već sačuvan sa drugim podacima. Otvorite ga na kontrolnoj tabli.')
      return { jobId: id, imagesReady: old.imagesReady === true, replayed: true }
    }
    const last = account.snapshots[2].data()?.lastJobCreatedAt?.toMillis?.() || 0
    if (Date.now() - last < 10000) throw new HttpsError('resource-exhausted', 'Sačekajte nekoliko sekundi pre slanja novog zahteva.')
    tx.create(ref, { ...payload, clientId: actor.uid, status: 'pending', schemaVersion: 2, imagePaths: [], imagesReady: data.photoCount === 0, createdAt: FieldValue.serverTimestamp() })
    tx.create(contact, { contactPhone })
    tx.update(account.snapshots[2].ref, { lastJobCreatedAt: FieldValue.serverTimestamp() })
    return { jobId: id, imagesReady: data.photoCount === 0, replayed: false }
  })
  return result
}
export async function acceptJob(actor: Actor, data: any) {
  requireWritesEnabled()
  object(data, ['jobId'])
  const id = jobId(data.jobId), db = getFirestore(), ref = db.doc(`jobs/${id}`)
  return db.runTransaction(async tx => {
    const account = await roles(tx, actor.uid)
    if (account.role !== 'tradesperson') throw new HttpsError('permission-denied', 'Potreban je nalog majstora.')
    const [snap, contact] = await tx.getAll(ref, ref.collection('private').doc('contact'))
    if (!snap.exists) throw new HttpsError('not-found', 'Posao ne postoji.')
    const job = snap.data()!, tp = account.snapshots[1].data()!
    if (job.clientId === actor.uid) throw new HttpsError('permission-denied', 'Ne možete prihvatiti sopstveni posao.')
    if (!contact.exists || typeof contact.data()?.contactPhone !== 'string' || !/^\+[0-9]{8,15}$/.test(contact.data()!.contactPhone)) throw new HttpsError('failed-precondition', 'Posao nema ispravan kontakt. Žeton nije potrošen.')
    if (job.acceptedByTradespersonId === actor.uid && ['accepted', 'completed'].includes(job.status)) return { jobId: id, acceptedBy: actor.uid, replayed: true }
    if (job.status !== 'pending' || job.acceptedByTradespersonId) throw new HttpsError('failed-precondition', 'Posao više nije dostupan.')
    if (job.imagesReady !== true || job.schemaVersion !== 2) throw new HttpsError('failed-precondition', 'Zahtev još nije spreman za prihvatanje.')
    if (job.city !== 'Beograd' || (tp.city || 'Beograd') !== job.city || specialization(tp.specialization) !== job.specializationRequired) throw new HttpsError('permission-denied', 'Posao ne odgovara vašoj struci ili gradu.')
    if (!Number.isSafeInteger(tp.balanceTokens) || tp.balanceTokens <= 0) throw new HttpsError('resource-exhausted', 'Nemate dovoljno žetona za ovaj posao.')
    tx.update(ref, {
      status: 'accepted', acceptedByTradespersonId: actor.uid, acceptedAt: FieldValue.serverTimestamp(),
      acceptedByTradespersonProfile: {
        displayName: tp.displayName || '', phoneNumber: tp.phoneNumber || '', bio: tp.bio || null,
        avatarPath: tp.avatarPath || null, avatarUpdatedAt: tp.avatarUpdatedAt || null,
        averageRating: Number(tp.averageRating || 0), ratingCount: Number(tp.ratingCount || 0),
      },
    })
    tx.update(account.snapshots[1].ref, { balanceTokens: tp.balanceTokens - 1 })
    return { jobId: id, acceptedBy: actor.uid, replayed: false }
  })
}
export async function finalizeJobImages(actor: Actor, data: any) {
  requireWritesEnabled()
  object(data, ['jobId', 'slots'])
  const id = jobId(data.jobId), db = getFirestore(), ref = db.doc(`jobs/${id}`)
  if (!Array.isArray(data.slots) || data.slots.length > 3 || new Set(data.slots).size !== data.slots.length || data.slots.some((s: any) => !Number.isInteger(s) || s < 0 || s > 2)) throw new HttpsError('invalid-argument', 'Neispravan izbor fotografija.')
  await requireRole(actor.uid, 'client')
  const snap = await ref.get(), job = snap.data()
  if (!job || job.clientId !== actor.uid) throw new HttpsError('permission-denied', 'Zahtev nije vaš.')
  const bucket = jobImagesBucket()
  const cleanup = () => Promise.allSettled(Array.from({ length: job.photoCount }, (_, slot) => bucket.file('job-uploads/' + actor.uid + '/' + id + '/' + slot + '.jpg').delete({ ignoreNotFound: true })))
  if (job.imagesReady === true) {
    await cleanup()
    return { jobId: id, imagesReady: true, imagePaths: job.imagePaths || [] }
  }
  if (job.status !== 'pending' || job.schemaVersion !== 2 || data.slots.some((s: number) => s >= job.photoCount)) throw new HttpsError('failed-precondition', 'Zahtev nije dostupan za fotografije.')
  // Validate before fixing the selection. A missing upload must still allow
  // the owner to retry with fewer photos or explicitly publish without photos.
  if (!Array.isArray(job.imageFinalizationSlots)) {
    for (const slot of data.slots) {
      const [metadata] = await bucket.file('job-uploads/' + actor.uid + '/' + id + '/' + slot + '.jpg').getMetadata()
      if (metadata.contentType !== 'image/jpeg' || !Number(metadata.size) || Number(metadata.size) >= 3 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Fotografija mora biti JPEG manji od 3 MB.')
    }
  }
  // First finalization fixes one immutable selection. Concurrent requests and
  // retries can only finish that selection; they cannot publish orphan variants.
  const selected: number[] = await db.runTransaction(async tx => {
    const fresh = (await tx.get(ref)).data()
    if (!fresh || fresh.clientId !== actor.uid || fresh.status !== 'pending') throw new HttpsError('failed-precondition', 'Zahtev više nije na čekanju.')
    if (Array.isArray(fresh.imageFinalizationSlots)) return fresh.imageFinalizationSlots
    const slots = [...data.slots].sort()
    tx.update(ref, { imageFinalizationSlots: slots })
    return slots
  })
  const paths: string[] = []
  // Copy within Storage, rather than downloading photos through the function.
  // Published objects are server-only, immutable, and have no download tokens.
  for (const slot of selected) {
    const path = `jobs/${id}/${slot}.jpg`, destination = bucket.file(path)
    try {
      const [existing] = await destination.getMetadata()
      if (existing.metadata?.jobOwner !== actor.uid || existing.metadata?.firebaseStorageDownloadTokens) throw new HttpsError('failed-precondition', 'Fotografija zahteva proveru podrške.')
    } catch (error: any) {
      if (Number(error.code) !== 404) throw error
      const source = bucket.file(`job-uploads/${actor.uid}/${id}/${slot}.jpg`)
      const [metadata] = await source.getMetadata()
      if (metadata.contentType !== 'image/jpeg' || !Number(metadata.size) || Number(metadata.size) >= 3 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Fotografija mora biti JPEG manji od 3 MB.')
      try {
        await bucket.file(source.name, { generation: metadata.generation }).copy(destination, {
          preconditionOpts: { ifGenerationMatch: 0 }, contentType: 'image/jpeg', cacheControl: 'private, no-store',
          metadata: { firebaseStorageDownloadTokens: null, jobOwner: actor.uid },
        })
      } catch (copyError: any) {
        if (Number(copyError.code) !== 412) throw copyError
        // Another identical finalization won the create-only copy.
        const [winner] = await destination.getMetadata()
        if (winner.metadata?.jobOwner !== actor.uid || winner.metadata?.firebaseStorageDownloadTokens) throw copyError
      }
    }
    paths.push(path)
  }
  const result = await db.runTransaction(async tx => {
    const fresh = (await tx.get(ref)).data()
    if (!fresh || fresh.clientId !== actor.uid) throw new HttpsError('permission-denied', 'Zahtev nije vaš.')
    if (fresh.imagesReady === true) return { jobId: id, imagesReady: true, imagePaths: fresh.imagePaths || [] }
    if (fresh.status !== 'pending') throw new HttpsError('failed-precondition', 'Zahtev više nije na čekanju.')
    tx.update(ref, { imagePaths: paths, imagesReady: true, imagesUpdatedAt: FieldValue.serverTimestamp() })
    return { jobId: id, imagesReady: true, imagePaths: paths }
  })
  // Bounded cleanup; a failed delete cannot undo a successfully published job.
  await cleanup()
  return result
}

// Photos are served in the bucket region. Firebase's download-URL API is
// deliberately inaccessible for published files, even to otherwise eligible viewers.
export async function readJobImage(actor: Actor, data: any): Promise<Buffer> {
  object(data, ['jobId', 'slot'])
  const id = jobId(data.jobId)
  if (!Number.isInteger(data.slot) || data.slot < 0 || data.slot > 2) throw new HttpsError('invalid-argument', 'Neispravna fotografija.')
  const job = (await getFirestore().doc('jobs/' + id).get()).data()
  const path = 'jobs/' + id + '/' + data.slot + '.jpg'
  if (!job || job.imagesReady !== true || !job.imagePaths?.includes(path)) throw new HttpsError('not-found', 'Fotografija nije dostupna.')
  let allowed = job.clientId === actor.uid || (job.acceptedByTradespersonId === actor.uid && ['accepted', 'completed'].includes(job.status))
  if (!allowed) {
    const account = await getFirestore().runTransaction(tx => roles(tx, actor.uid))
    const tp = account.snapshots[1].data()
    allowed = account.role === 'admin' || (account.role === 'tradesperson' && job.status === 'pending' && job.city === 'Beograd' && (tp?.city || 'Beograd') === job.city && specialization(tp?.specialization) === job.specializationRequired)
  }
  if (!allowed) throw new HttpsError('permission-denied', 'Nemate pristup fotografiji.')
  const chunks: Buffer[] = []
  // Range bounds memory even if an administrator accidentally replaces a file.
  const stream = jobImagesBucket().file(path).createReadStream({ start: 0, end: 3 * 1024 * 1024, validation: false })
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const image = Buffer.concat(chunks)
  if (!image.length || image.length >= 3 * 1024 * 1024) throw new HttpsError('failed-precondition', 'Fotografija nije ispravna.')
  return image
}
function jobImagesBucket() {
  return getStorage().bucket(demo() ? process.env.GCLOUD_PROJECT + '.appspot.com' : imageBucket.value())
}
