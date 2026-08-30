export const PROVIDER_MAINTENANCE_MESSAGE =
  "Provider AI sedang dalam maintenance. Pembuatan dokumen sementara tidak tersedia; silakan coba kembali setelah pemeliharaan selesai.";

export function isProviderMaintenance(status: number, details?: string): boolean {
  return (
    status === 503 ||
    /maintenance|under maintenance|scheduled maintenance/i.test(details || "")
  );
}
