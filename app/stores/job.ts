import { defineStore } from 'pinia'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'

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
      const { $firestore } = useNuxtApp()
      const jobsCol = collection($firestore, 'jobs')
      const payload = {
        problemDescription: input.problemDescription,
        location: input.location || '',
        contactPhone: input.contactPhone,
        imageUrl: input.imageUrl || null,
        specializationRequired: input.specializationRequired,
        status: 'pending',
        createdAt: serverTimestamp()
      }
      const docRef = await addDoc(jobsCol, payload)
      return { jobId: docRef.id }
    }
  }
})


