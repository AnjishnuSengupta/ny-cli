import { AllmangaProvider, MegaPlayProvider, HttpClient } from 'anime-sdk';

async function testProvider(provider, title) {
  console.log(`\n=== Testing ${provider.name} with ${title} ===`);
  try {
    const searchResults = await provider.search(title);
    if (!searchResults || searchResults.length === 0) {
      console.log('No search results found.');
      return;
    }
    const animeId = searchResults[0].id;
    console.log(`Found anime ID: ${animeId}`);

    const units = await provider.fetchContentUnits(animeId);
    if (!units || units.length === 0) {
      console.log('No content units (episodes) found.');
      return;
    }

    const firstEp = units[0];
    console.log(`Resolving stream for episode ID: ${firstEp.id}`);
    const streams = await provider.resolveStream(firstEp.id, 'sub');
    
    console.log('Stream result:', JSON.stringify(streams, null, 2));
  } catch (err) {
    console.error(`Error with ${provider.name}:`, err.message);
  }
}

async function main() {
  const http = new HttpClient({ timeoutMs: 25000 });
  const allmanga = new AllmangaProvider(http);
  const megaplay = new MegaPlayProvider(http);

  await testProvider(allmanga, 'One Punch Man');
  await testProvider(megaplay, 'One Punch Man');
  
  await testProvider(allmanga, 'Mob Psycho 100');
  await testProvider(megaplay, 'Mob Psycho 100');
}

main().catch(console.error);
