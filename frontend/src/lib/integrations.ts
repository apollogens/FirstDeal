import { arrayOf, isDateString, isNumber, isRecord, isString, nullable, objectOf, oneOf, optional } from "./api-validation";

export type IntegrationCategory = "mail" | "finance" | "documents_news";
export type IntegrationStatus = "healthy" | "degraded" | "configured" | "unconfigured";

export type JuryScenario = {
  title: string;
  setup: string;
  command: string;
  expected_result: string;
  test_file: string;
  test_status: string;
};

export type BoundedLimits = {
  timeout_seconds: number;
  max_response_bytes: number;
  max_items?: number | null;
  cache_ttl_seconds?: number | null;
  retry_attempts: number;
};

export type IntegrationItem = {
  id: string;
  category: IntegrationCategory;
  name: string;
  description: string;
  status: IntegrationStatus;
  auth_type: string;
  setup_instructions: string;
  bounded_limits: BoundedLimits;
  jury_scenario: JuryScenario;
  details: Record<string, unknown>;
  last_checked_at: string;
};

export type IntegrationRegistryResponse = {
  items: IntegrationItem[];
  total: number;
  healthy_count: number;
  timestamp: string;
};

export async function getIntegrationsStatus(signal?: AbortSignal): Promise<IntegrationRegistryResponse> {
  const response = await fetch("/api/integrations/status", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load integrations status: ${response.status}`);
  }
  const data: unknown = await response.json();
  const validate = objectOf<IntegrationRegistryResponse>({
    items: arrayOf(objectOf<IntegrationItem>({
      id: isString, category: oneOf("mail", "finance", "documents_news"), name: isString, description: isString,
      status: oneOf("healthy", "degraded", "configured", "unconfigured"), auth_type: isString, setup_instructions: isString,
      bounded_limits: objectOf<BoundedLimits>({ timeout_seconds: isNumber, max_response_bytes: isNumber, max_items: optional(nullable(isNumber)), cache_ttl_seconds: optional(nullable(isNumber)), retry_attempts: isNumber }),
      jury_scenario: objectOf<JuryScenario>({ title: isString, setup: isString, command: isString, expected_result: isString, test_file: isString, test_status: isString }),
      details: isRecord, last_checked_at: isDateString,
    })), total: isNumber, healthy_count: isNumber, timestamp: isDateString,
  });
  if (!validate(data)) throw new Error("Сервис вернул некорректный статус интеграций.");
  return data;
}
