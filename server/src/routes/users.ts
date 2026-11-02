import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { userProfile } from "../services/ratings.js";

const router = Router();
router.use(requireAuth);

/** R-DEC-43: any signed-in user can open anyone's public profile. */
router.get("/:id", async (req, res, next) => {
  try {
    res.json(await userProfile(String(req.params.id)));
  } catch (err) {
    next(err);
  }
});

export default router;
