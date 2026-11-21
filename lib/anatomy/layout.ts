import type { OrganId, Vec3 } from "@/types/health";

/**
 * Viewer-space anatomy map. The figure faces +Z (towards the camera), so the patient's
 * RIGHT side is at -X (the liver sits on the viewer's left, as in a clinical front view).
 * Units: ~1 unit ≈ 22 cm; the torso spans y ≈ -1.7 … 1.9.
 */
export interface OrganMeta {
  id: OrganId;
  label: string;
  /** Centre used for camera focus and callout anchors. */
  center: Vec3;
  /** Camera position for the close-up "inspect" view. */
  focusCamera: Vec3;
  /** Direction the organ moves in exploded view. */
  explode: Vec3;
  role: string;
}

export const ORGANS: Record<OrganId, OrganMeta> = {
  heart: {
    id: "heart",
    label: "Heart",
    center: [0.12, 0.78, 0.12],
    focusCamera: [1.0, 1.15, 2.9],
    explode: [0.2, 0.55, 0.35],
    role: "Pumps blood; troponin rises when heart muscle is injured.",
  },
  liver: {
    id: "liver",
    label: "Liver",
    center: [-0.38, 0.2, 0.08],
    focusCamera: [-1.6, 0.5, 2.6],
    explode: [-0.65, 0.18, 0.2],
    role: "Processes nutrients and makes bile, which drains to the duodenum.",
  },
  stomach: {
    id: "stomach",
    label: "Stomach",
    center: [0.32, 0.08, 0.2],
    focusCamera: [1.5, 0.35, 2.6],
    explode: [0.6, 0.12, 0.4],
    role: "Acid digestion; empties through the pylorus into the duodenum.",
  },
  duodenum: {
    id: "duodenum",
    label: "Duodenum",
    center: [-0.2, -0.24, 0.12],
    focusCamera: [-1.2, 0.0, 2.6],
    explode: [-0.35, -0.3, 0.45],
    role: "First part of the small bowel; receives stomach contents, bile and pancreatic juice.",
  },
  pancreas: {
    id: "pancreas",
    label: "Pancreas",
    center: [0.14, -0.12, -0.08],
    focusCamera: [0.9, 0.2, 2.6],
    explode: [0.1, -0.15, -0.55],
    role: "Makes digestive enzymes (lipase, amylase) and insulin.",
  },
  kidneys: {
    id: "kidneys",
    label: "Kidneys",
    center: [0, -0.42, -0.3],
    focusCamera: [0.4, -0.1, 2.9],
    explode: [0, -0.5, -0.7],
    role: "Filter blood; creatinine and eGFR track how well they do it.",
  },
};

/** Lesion anchor points per organ and lesion kind. */
export const LESION_SITES: Record<string, { organ: OrganId; position: Vec3 }> = {
  pancreas_head: { organ: "pancreas", position: [-0.13, -0.19, -0.02] },
  pancreas_body: { organ: "pancreas", position: [0.16, -0.1, -0.1] },
  duodenal_bulb: { organ: "duodenum", position: [-0.05, -0.06, 0.2] },
  gastric_antrum: { organ: "stomach", position: [0.12, -0.08, 0.27] },
  liver_hilum: { organ: "liver", position: [-0.32, 0.06, 0.12] },
  myocardium: { organ: "heart", position: [0.2, 0.72, 0.2] },
  renal_cortex: { organ: "kidneys", position: [0.44, -0.4, -0.3] },
};

/** Anatomical routes rendered as glowing splines. */
export const CONNECTION_PATHS: Record<
  string,
  { label: string; organs: OrganId[]; points: Vec3[]; description: string }
> = {
  pancreatic_duct: {
    label: "Pancreatic duct → Duodenum → Stomach",
    organs: ["pancreas", "duodenum", "stomach"],
    points: [
      [0.55, -0.02, -0.14], // tail
      [0.3, -0.07, -0.1], // body
      [0.05, -0.14, -0.05], // neck
      [-0.15, -0.21, 0.0], // head
      [-0.27, -0.24, 0.06], // ampulla of Vater (into 2nd part of duodenum)
      [-0.27, -0.06, 0.16], // up the descending duodenum
      [-0.06, -0.04, 0.22], // duodenal bulb
      [0.1, -0.06, 0.27], // pylorus / gastric antrum
      [0.34, 0.1, 0.24], // stomach body
    ],
    description:
      "Enzymes from the pancreas drain through the pancreatic duct into the duodenum at the ampulla. The duodenal bulb sits just past the pylorus, so inflammation here, in the pancreatic head and in the gastric outlet can share the same epigastric pain.",
  },
  biliary_tree: {
    label: "Liver → Bile duct → Ampulla",
    organs: ["liver", "duodenum", "pancreas"],
    points: [
      [-0.35, 0.12, 0.1],
      [-0.28, 0.0, 0.08],
      [-0.24, -0.12, 0.04],
      [-0.26, -0.22, 0.04],
      [-0.27, -0.24, 0.06],
    ],
    description:
      "Bile leaves the liver through the common bile duct, which passes through the pancreatic head and joins the pancreatic duct at the ampulla. A blockage here can raise liver enzymes and pancreatic enzymes together.",
  },
  hepatic_portal: {
    label: "Gut → Portal vein → Liver",
    organs: ["stomach", "pancreas", "liver"],
    points: [
      [0.3, 0.02, 0.15],
      [0.1, -0.08, 0.0],
      [-0.12, -0.02, -0.02],
      [-0.3, 0.12, 0.05],
    ],
    description: "Blood from the stomach, pancreas and bowel drains through the portal vein into the liver.",
  },
  renal_perfusion: {
    label: "Heart → Aorta → Kidneys",
    organs: ["heart", "kidneys"],
    points: [
      [0.08, 0.7, 0.05],
      [0.04, 0.35, -0.2],
      [0.02, 0.0, -0.28],
      [0.02, -0.35, -0.3],
      [0.38, -0.4, -0.3],
    ],
    description: "The kidneys receive about a fifth of the heart's output; poor perfusion or dehydration shows up as rising creatinine.",
  },
};
