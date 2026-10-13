import providersConfig from "../../config/providers.json";

export const SPECIALIST_MODEL_RECOMMENDATIONS: Record<string, string[]> =
  providersConfig.specialist_recommendations ?? {};
