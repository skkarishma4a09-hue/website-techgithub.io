import { Router } from 'express';
import { createAlert, getAlerts, updateAlert, deleteAlert } from '../controllers/alertController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.use(authenticateToken);

router.get('/', getAlerts);
router.post('/', createAlert);
router.put('/:id', updateAlert);
router.delete('/:id', deleteAlert);

export default router;
