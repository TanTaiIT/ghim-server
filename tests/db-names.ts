/** DB của một worker trong một lượt chạy: khác lượt thì khác tên, nên hai lượt chạy cùng lúc không giẫm nhau. */
export function workerDatabaseUrl(templateUrl: string, runId: string, worker: number): string {
  const url = new URL(templateUrl);
  const template = url.pathname.replace(/^\//, '').replace(/_test$/, '');
  url.pathname = `/${template}_${runId}_w${worker}_test`;
  return url.toString();
}

export const databaseName = (databaseUrl: string): string =>
  decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
