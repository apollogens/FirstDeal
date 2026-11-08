import { isString, objectOf } from "./api-validation";

export type VersionInfo = {
  app_name: string;
  version: string;
  commit_sha: string;
  branch: string;
  build_date: string;
  environment: string;
  database_revision: string;
};

export async function getVersionInfo(signal?: AbortSignal): Promise<VersionInfo> {
  const response = await fetch("/api/version", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Failed to load version info: ${response.status}`);
  }
  const data: unknown = await response.json();
  const validate = objectOf<VersionInfo>({ app_name: isString, version: isString, commit_sha: isString, branch: isString, build_date: isString, environment: isString, database_revision: isString });
  if (!validate(data)) throw new Error("Сервис вернул некорректные сведения о версии.");
  return data;
}
