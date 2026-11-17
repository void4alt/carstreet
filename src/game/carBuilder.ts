import * as THREE from 'three';
import {
  applyVehicleMaterialCustomization,
  buildR34BlueprintModel,
  getVehicleStructuralKey,
} from './r34Builder';
import { VehicleCustomization, VehicleSpec } from './types';

export interface DetailedCarRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  knuckleFL: THREE.Group;
  knuckleFR: THREE.Group;
  knuckleRL: THREE.Group;
  knuckleRR: THREE.Group;
  spinFL: THREE.Group;
  spinFR: THREE.Group;
  spinRL: THREE.Group;
  spinRR: THREE.Group;
  steeringWheelMesh: THREE.Group;
  popUpLightsGroup: THREE.Group;
  headlightBeams: THREE.Group;
  roadBeamLight: THREE.SpotLight | null;
  backfireFlames: THREE.Group;
  backfireLight: THREE.PointLight | null;
  exhaustOutlets: Array<[number, number, number]>;
  bodyMaterial: THREE.MeshPhysicalMaterial;
  rimMaterial: THREE.MeshPhysicalMaterial;
  caliperMaterial: THREE.MeshPhysicalMaterial;
  windowGlassMaterial: THREE.MeshPhysicalMaterial;
  tailLightMaterial: THREE.MeshStandardMaterial;
  tailRunningMaterial: THREE.MeshStandardMaterial;
  brakeLightMaterial: THREE.MeshStandardMaterial;
  reverseLightMaterial: THREE.MeshStandardMaterial;
  amberMaterial: THREE.MeshStandardMaterial;
  turnSignalLeftMaterial: THREE.MeshStandardMaterial;
  turnSignalRightMaterial: THREE.MeshStandardMaterial;
  rearTailLight: THREE.PointLight | null;
  dispose: () => void;
}

/**
 * Builds a high-detail, blueprint-grade 3D vehicle rig for all 26 iconic JDM & Exotic machines.
 * Features a 72-station Catmull-Rom spline chassis, sculpted front & rear fascias,
 * modular body kits (bumpers, splitters, canards, side skirts, widebody fenders, rear diffusers,
 * hoods, grilles, spoilers, and exhausts), functional low/high headlight road illumination,
 * multi-layered orange & blue exhaust backfire flames, and 4 independently suspended/steering/spinning wheels.
 */
export function buildDetailedVehicleModel(
  spec: VehicleSpec,
  custom: VehicleCustomization,
  isSoftwareGl: boolean
): DetailedCarRig {
  return buildR34BlueprintModel(spec, custom, isSoftwareGl);
}

export { applyVehicleMaterialCustomization, getVehicleStructuralKey };

