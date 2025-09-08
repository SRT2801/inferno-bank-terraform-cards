const { build } = require('esbuild');
const { readdirSync, mkdirSync } = require('fs');
const { join } = require('path');
const AdmZip = require('adm-zip');

const HANDLERS_DIR = 'src/handlers';
console.log('🚀 ~ HANDLERS_DIR:', HANDLERS_DIR);

const buildLambdas = async () => {
  mkdirSync('./lambda', { recursive: true });

  const lambdaFolders = readdirSync(join(__dirname, HANDLERS_DIR), {
    withFileTypes: true,
  })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  console.log(
    `Found ${
      lambdaFolders.length
    } Lambda functions to build: ${lambdaFolders.join(', ')}`
  );

  for (const lambdaName of lambdaFolders) {
    console.log(`\n🔨 Building ${lambdaName}...`);

    mkdirSync(`./lambda/${lambdaName}`, { recursive: true });

    await build({
      entryPoints: [`${HANDLERS_DIR}/${lambdaName}/index.ts`],
      bundle: true,
      minify: true,
      platform: 'node',
      target: ['node18'],
      outfile: `./lambda/${lambdaName}/index.js`,
      metafile: true,
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });

    console.log(`✅ Bundle created for ${lambdaName}`);

    try {
      const zip = new AdmZip();

      zip.addLocalFile(`./lambda/${lambdaName}/index.js`);

      zip.writeZip(`./lambda/${lambdaName}.zip`);

      console.log(`📦 Created ${lambdaName}.zip`);
    } catch (error) {
      console.error(`❌ Error creating zip for ${lambdaName}:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n🚀 All Lambda functions built successfully!');
};

buildLambdas().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});