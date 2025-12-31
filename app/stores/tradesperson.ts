import { defineStore } from 'pinia'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import type { SupportedCity } from '@/utils/cities'

export interface TradespersonProfile {
  uid: string
  displayName: string
  phoneNumber: string
  specialization: string
  city?: string
  bio?: string
  avatarPath?: string
  avatarUpdatedAt?: any
  status: 'available' | 'unavailable'
  balanceTokens: number
  notificationPreference: 'push' | 'viber' | 'sms'
  dismissedJobs?: string[]
  ratingSum?: number
  ratingCount?: number
  averageRating?: number
}

interface TradespersonState {
  profile: TradespersonProfile | null
  _unsub: (() => void) | null
}

export const useTradespersonStore = defineStore('tradesperson', {
  state: (): TradespersonState => ({
    profile: null,
    _unsub: null
  }),
  actions: {
    async loadProfile(uid: string) {
      if (!uid || typeof uid !== 'string') {
        return
      }
      // Backwards-compatible alias (older code used loadProfile)
      this.subscribeProfile(uid)
    },
    subscribeProfile(uid: string) {
      const { $firestore } = useNuxtApp()
      this.unsubscribe()
      const ref = doc($firestore, 'tradespeople', uid)
      this._unsub = onSnapshot(ref, (snap) => {
        this.profile = snap.exists() ? ({ ...(snap.data() as any), uid } as unknown as TradespersonProfile) : null
      })
    },
    unsubscribe() {
      if (this._unsub) {
        this._unsub()
        this._unsub = null
      }
    },
    async setAvailability(isAvailable: boolean) {
      const profile = this.profile
      if (!profile) return
      const { $firestore, $firebaseAuth } = useNuxtApp() as any
      const safeUid = ($firebaseAuth?.currentUser?.uid) || profile.uid
      const ref = doc($firestore, 'tradespeople', safeUid)
      await updateDoc(ref, { status: isAvailable ? 'available' : 'unavailable' })
    },
    async setNotificationPreference(pref: 'push' | 'viber' | 'sms') {
      const profile = this.profile
      if (!profile) return
      const { $firestore } = useNuxtApp()
      const ref = doc($firestore, 'tradespeople', profile.uid)
      await updateDoc(ref, { notificationPreference: pref })
    },
    async setCity(city: SupportedCity) {
      const profile = this.profile
      if (!profile) return
      const { $firestore } = useNuxtApp()
      const ref = doc($firestore, 'tradespeople', profile.uid)
      await updateDoc(ref, { city })
    },
    async dismissJob(jobId: string) {
      const profile = this.profile
      if (!profile) return
      const { $firestore } = useNuxtApp()
      const ref = doc($firestore, 'tradespeople', profile.uid)
      try {
        await updateDoc(ref, { dismissedJobs: (await import('firebase/firestore')).arrayUnion(jobId) })
      } catch (e: any) {
        const msg = e?.message || 'Ne mogu da sačuvam odbijanje posla.'
        throw new Error(msg)
      }
    }
  }
})


