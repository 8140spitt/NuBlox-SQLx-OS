// @nublox/sqlx-core/src/url.ts
export type SslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';

export function parseSslMode(raw?: string): SslMode {
    const s = (raw || '').toLowerCase();
    if (['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(s)) return s as SslMode;
    return 'prefer';
}
