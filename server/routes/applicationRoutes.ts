import { Router } from 'express';
import { applyToJob, getApplications, updateApplicationStatus } from '../controllers/applicationController.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateApplicationStatus } from '../middleware/validate.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getApplications);
router.post('/', applyToJob);
router.put('/:id/status', validateApplicationStatus, updateApplicationStatus);

export default router;
