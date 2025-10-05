import { defineStore } from 'pinia'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

interface CreateJobInput {
  problemDescription: string
  location?: string
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
      const payload = {
        problemDescription: input.problemDescription,
        location: input.location || '',
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


