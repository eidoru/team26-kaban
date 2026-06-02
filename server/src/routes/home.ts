import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getHomeOverview } from "../services/homeOverview.js";

const router = Router();

router.use(requireAuth);

router.get("/overview", async (req, res, next) => {
  try {
    const overview = await getHomeOverview(req.user!.id);
    res.json(overview);
  } catch (err) {
    next(err);
  }
});

export default router;
