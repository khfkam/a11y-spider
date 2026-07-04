import { readFile } from 'node:fs/promises';

export interface IngestOptions {
  urlsFilePath: string;
  allowHttp: boolean;
}

export interface IngestedTarget {
  url: string;
  line: number;
}

/**
 * Read and validate production URLs from urls.txt.
 * @see A11y_Spider_Proposal_v2.md §7
 */
export async function ingestUrls(_options: IngestOptions): Promise<IngestedTarget[]> {
  // TODO: implement URL validation (HTTPS, no localhost/private IPs)
  const content = await readFile(_options.urlsFilePath, 'utf8');
  return content
    .split('\n')
    .map((line, index) => ({ line: index + 1, raw: line.trim() }))
    .filter(({ raw }) => raw.length > 0 && !raw.startsWith('#'))
    .map(({ raw, line }) => ({ url: raw, line }));
}
