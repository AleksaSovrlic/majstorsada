import { defineStore } from 'pinia'
import { GeoPoint, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { geohashForLocation } from 'geofire-common'
import { isWithinBelgradeBbox } from '@/utils/geofence'

interface CreateJobInput {
  problemDescription: string
  address: string
  coordinates: { lat: number; lng: number }
  city: string | null
  contactPhone: string
  imageUrl?: string
  specializationRequired: string
}

export const useJobStore = defineStore('job', {
  actions: {
    async createJob(input: CreateJobInput) {
      const { $firestore, $firebaseApp } = useNuxtApp()
      const jobsCol = collection($firestore, 'jobs')
      const auth = getAuth($firebaseApp)
      const currentUser = auth.currentUser
      if (!currentUser) {
        throw new Error('Morate biti prijavljeni da biste poslali zahtev.')
      }

      const address = (input.address || '').trim()
      const lat = Number(input.coordinates?.lat)
      const lng = Number(input.coordinates?.lng)
      const city = typeof input.city === 'string' ? input.city.trim() : null
      if (!address) {
        throw new Error('Molimo izaberite adresu iz liste.')
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Molimo izaberite adresu iz liste (nedostaju koordinate).')
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Koordinate adrese nisu validne.')
      }
      if (!isWithinBelgradeBbox(lat, lng)) {
        throw new Error('Trenutno primamo zahteve samo na širem području Beograda.')
      }

      const geoPoint = new GeoPoint(lat, lng)
      const geohash = geohashForLocation([lat, lng])
      const payload = {
        problemDescription: input.problemDescription,
        // Backwards-compat: keep legacy `location` populated for existing UI and notifications.
        location: address,
        address,
        city: city && city.length ? city : null,
        coordinates: geoPoint,
        geohash,
        contactPhone: input.contactPhone,
        imageUrl: input.imageUrl || null,
        specializationRequired: input.specializationRequired,
        clientId: currentUser.uid,
        clientEmail: currentUser.email || '',
        status: 'pending',
        createdAt: serverTimestamp()
      }
      const docRef = await addDoc(jobsCol, payload)
      return { jobId: docRef.id }
    }
  }
})


