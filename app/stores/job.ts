import { defineStore } from 'pinia'
import { useApi } from '@/utils/api'
interface CreateJobInput {
  requestId: string
  problemDescription: string
  address: string
  coordinates: { lat: number; lng: number }
  city: string | null
  contactPhone: string
  specializationRequired: string
  photoCount: number
}
export const useJobStore = defineStore('job', () => {
  const api = useApi()
  async function createJob(input: CreateJobInput) {
    return api<{ jobId: string; imagesReady: boolean; replayed: boolean }>('createJob', { ...input, city: 'Beograd' })
  }
  return { createJob }
})
