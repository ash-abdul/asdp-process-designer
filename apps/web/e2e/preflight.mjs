/**
 * Browser preflight — ADR-0040 §3.
 *
 * A missing browser is a REFUSAL with instructions. It must never fall back to
 * downloading one, and no flag may be added that lets it.
 */
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!existsSync(CHROME)) {
  console.error(
    '\nBrowser tests need Google Chrome, and it is not installed at:\n' +
      `  ${CHROME}\n\n` +
      'ADR-0040: this suite NEVER downloads a browser. Install Chrome and run again.\n' +
      'Nothing will be fetched on your behalf.\n',
  );
  process.exit(1);
}

// Report the version, because ADR-0040 accepts that a browser we do not control
// can change under us and says the price of that is visibility.
const version = execFileSync(CHROME, ['--version'], { encoding: 'utf8' }).trim();
console.log(`browser preflight: ${version} (system-installed; nothing downloaded)`);
