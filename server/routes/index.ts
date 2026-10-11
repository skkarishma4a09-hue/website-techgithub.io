import { Router } from 'express';
import authRoutes from './authRoutes.js';
import profileRoutes from './profileRoutes.js';
import jobRoutes from './jobRoutes.js';
import savedJobRoutes from './savedJobRoutes.js';
import applicationRoutes from './applicationRoutes.js';
import alertRoutes from './alertRoutes.js';
import adminRoutes from './adminRoutes.js';
import marketplaceRoutes from './marketplaceRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/jobs', jobRoutes);
router.use('/saved-jobs', savedJobRoutes);
router.use('/applications', applicationRoutes);
router.use('/alerts', alertRoutes);
router.use('/admin', adminRoutes);
router.use(marketplaceRoutes);

export default router;
