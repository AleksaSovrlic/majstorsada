"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyTradespeople = exports.buyTokens = exports.acceptJob = exports.health = void 0;
const https_1 = require("firebase-functions/v2/https");
const firebase_functions_1 = require("firebase-functions");
const logger = __importStar(require("firebase-functions/logger"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
exports.health = (0, https_1.onRequest)({ region: 'europe-west3' }, (req, res) => {
    res.status(200).send({ ok: true, service: 'functions', env: process.env.NODE_ENV || 'development' });
});
exports.acceptJob = (0, https_1.onCall)({ region: 'europe-west3' }, async (request) => {
    const auth = request.auth;
    const data = request.data;
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    if (!data?.jobId || typeof data.jobId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Missing or invalid jobId.');
    }
    const db = (0, firestore_1.getFirestore)();
    const jobRef = db.collection('jobs').doc(data.jobId);
    const tradespersonRef = db.collection('tradespeople').doc(auth.uid);
    try {
        const result = await db.runTransaction(async (tx) => {
            const [jobSnap, tradespersonSnap] = await Promise.all([
                tx.get(jobRef),
                tx.get(tradespersonRef)
            ]);
            if (!jobSnap.exists) {
                throw new https_1.HttpsError('not-found', 'Job does not exist.');
            }
            const job = jobSnap.data();
            if (job.status !== 'pending') {
                throw new https_1.HttpsError('failed-precondition', 'Job is not available for acceptance.');
            }
            if (!tradespersonSnap.exists) {
                throw new https_1.HttpsError('permission-denied', 'Tradesperson profile not found.');
            }
            const tp = tradespersonSnap.data();
            const tokens = Number(tp.balanceTokens ?? 0);
            if (!Number.isFinite(tokens) || tokens <= 0) {
                throw new https_1.HttpsError('failed-precondition', 'Nemate dovoljno žetona da prihvatite ovaj posao.');
            }
            // Apply updates atomically
            tx.update(jobRef, {
                status: 'accepted',
                acceptedByTradespersonId: auth.uid
            });
            tx.update(tradespersonRef, {
                balanceTokens: firestore_1.FieldValue.increment(-1)
            });
            return { jobId: data.jobId, acceptedBy: auth.uid };
        });
        logger.info('acceptJob success', result);
        return { ok: true, ...result };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError) {
            logger.warn('acceptJob failed (HttpsError)', { code: error.code, message: error.message });
            throw error;
        }
        logger.error('acceptJob failed (unexpected)', { message: error?.message, stack: error?.stack });
        throw new https_1.HttpsError('internal', 'Unexpected error during acceptJob.');
    }
});
exports.buyTokens = (0, https_1.onCall)({ region: 'europe-west3' }, async (request) => {
    const auth = request.auth;
    const data = request.data;
    if (!auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    }
    const paketId = data?.paketId;
    if (!paketId || typeof paketId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'paketId is required.');
    }
    logger.info('buyTokens requested', { paketId, uid: auth.uid });
    // Payment integration will be implemented later
    return { ok: true, paketId };
});
exports.notifyTradespeople = (0, firebase_functions_1.region)('europe-west3')
    .firestore
    .document('jobs/{jobId}')
    .onCreate(async (snap, context) => {
    const db = (0, firestore_1.getFirestore)();
    const jobData = snap.data();
    if (!jobData) {
        logger.warn('notifyTradespeople: No job data found');
        return;
    }
    const specializationRequired = jobData.specializationRequired;
    if (!specializationRequired) {
        logger.info('notifyTradespeople: Job without specializationRequired, skipping');
        return;
    }
    try {
        const snapshot = await db
            .collection('tradespeople')
            .where('specialization', '==', specializationRequired)
            .where('status', '==', 'available')
            .get();
        logger.info('notifyTradespeople: matching tradespeople', {
            count: snapshot.size,
            specializationRequired
        });
        snapshot.forEach((doc) => {
            logger.info(`Notifikacija bi bila poslata majstoru: ${doc.id}`);
        });
    }
    catch (err) {
        logger.error('notifyTradespeople: query failed', { message: err?.message });
    }
});
