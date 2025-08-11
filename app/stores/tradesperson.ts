import { defineStore } from 'pinia'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'

export interface TradespersonProfile {
  uid: string
  displayName: string
  phoneNumber: string
  specialization: string
  status: 'available' | 'unavailable'
  balanceTokens: number
  notificationPreference: 'push' | 'viber' | 'sms'
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
      console.log('[tradesperson] loadProfile POZVANA sa uid:', uid)
      console.log('Tip primljenog UID-a:', typeof uid)

      if (!uid || typeof uid !== 'string') {
        console.error('UID nije validan! Prekidam učitavanje profila.')
        return
      }

      const { $firestore } = useNuxtApp()
      this.unsubscribe()
      const ref = doc($firestore, 'tradespeople', uid)
      this._unsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? ({ uid, ...(snap.data() as any) }) : null
        console.log('[tradesperson] PODACI STIGLI IZ FIRESTORE-A:', data)
        this.profile = data as unknown as TradespersonProfile | null
        console.log('[tradesperson] Profil UPISAN u store:', this.profile)
      })
    },
    subscribeProfile(uid: string) {
      const { $firestore } = useNuxtApp()
      this.unsubscribe()
      const ref = doc($firestore, 'tradespeople', uid)
      this._unsub = onSnapshot(ref, (snap) => {
        this.profile = snap.exists() ? ({ uid, ...(snap.data() as any) } as unknown as TradespersonProfile) : null
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
      console.log('[tradesperson] setAvailability called', {
        isAvailable,
        hasProfile: !!profile,
        uid: profile?.uid
      })
      if (!profile) return
      const { $firestore } = useNuxtApp()
      const ref = doc($firestore, 'tradespeople', profile.uid)
      console.log('[tradesperson] updateDoc about to run', {
        docPath: `tradespeople/${profile.uid}`,
        status: isAvailable ? 'available' : 'unavailable'
      })
      await updateDoc(ref, { status: isAvailable ? 'available' : 'unavailable' })
      console.log('[tradesperson] updateDoc success', {
        docPath: `tradespeople/${profile.uid}`
      })
    },
    async setNotificationPreference(pref: 'push' | 'viber' | 'sms') {
      const profile = this.profile
      if (!profile) return
      const { $firestore } = useNuxtApp()
      const ref = doc($firestore, 'tradespeople', profile.uid)
      await updateDoc(ref, { notificationPreference: pref })
    }
  }
})


