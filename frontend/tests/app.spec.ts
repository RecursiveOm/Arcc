import { test, expect } from '@playwright/test';
const video={id:'test-video',title:'Understanding vector search',source_type:'upload',duration:120,created_at:'2026-09-21T00:00:00Z',status:'ready',stage:'Ready',has_media:false,embedded:1,language:'en',transcript:[{start:12,end:22,text:'Vectors represent semantic meaning.'}],chunks:[],analysis:{overview:'A video about semantic search.',detailed_summary:[{title:'Search',content:'Vectors help find similar ideas.'}],key_takeaways:['Meaning improves retrieval.'],study_notes:[{title:'Embedding',content:'A numerical representation of meaning.'}],chapters:[{start:12,title:'Vector search',description:'How retrieval works.'}],important_moments:[],topics:['Retrieval'],entities:['Vectors']},ml:{num_clusters:1,silhouette_score:null,topics:[{cluster_id:0,label:'Retrieval',representative_chunk_ids:[]}],points:[{chunk_id:0,start:12,end:22,cluster_id:0,x:0,y:0}]}};
test.beforeEach(async({page})=>{
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let body:unknown={};
    if(url.pathname==='/api/settings')body={deepseek_configured:true,deepseek_model:'openrouter/free',whisper_model:'small',ffmpeg_available:true,max_upload_mb:1024};
    else if(url.pathname==='/api/videos')body=[video];
    else if(url.pathname.endsWith('/chat'))body=route.request().method()==='POST'?{role:'assistant',content:'The video discusses semantic retrieval.',citations:[{start:12,end:22,text:'Evidence'}]}:[];
    else body=video;
    await route.fulfill({json:body});
  });
});
test('ingestion, routed analysis, dedicated chat and range validation',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Understand every moment.'})).toBeVisible();
  await page.getByLabel('Start with a YouTube link').fill('https://youtu.be/jNQXAC9IVRw');
  await page.getByRole('button',{name:'Analyze',exact:true}).click();
  await expect(page).toHaveURL(/\/video\/test-video$/);
  await expect(page.getByRole('heading',{name:video.title})).toBeVisible();
  await expect(page.getByText(video.analysis.overview)).toBeVisible();
  await page.getByRole('button',{name:'Detailed',exact:true}).click();
  await expect(page.getByText('Vectors help find similar ideas.')).toBeVisible();
  const nav=page.getByRole('navigation',{name:'Video sections'});
  await nav.getByRole('link',{name:'Transcript',exact:true}).click();
  await expect(page.getByText('Vectors represent semantic meaning.')).toBeVisible();
  await page.getByLabel('Search transcript').fill('not present');
  await expect(page.getByText('No matching passages. Try a different word.')).toBeVisible();
  await nav.getByRole('link',{name:'Topics',exact:true}).click();
  await expect(page.getByRole('button',{name:'Seek 00:12, topic 1'})).toBeVisible();
  await nav.getByRole('link',{name:'Study Notes',exact:true}).click();
  await expect(page.getByText('A numerical representation of meaning.')).toBeVisible();
  await nav.getByRole('link',{name:'Ask ARC',exact:true}).click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.locator('.player-wrap')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Follow your curiosity.'})).toBeVisible();
  await page.getByRole('textbox',{name:'Ask ARC',exact:true}).fill('What is the main topic?');
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/chat'));
  await page.getByRole('textbox',{name:'Ask ARC',exact:true}).press('Enter');
  expect((await sent).postDataJSON()).toEqual({question:'What is the main topic?',start:null,end:null});
  await expect(page.getByText('The video discusses semantic retrieval.')).toBeVisible();
  const citation=page.getByRole('button',{name:'00:12',exact:true});
  await citation.click();
  await expect(page.getByRole('dialog',{name:'Source moment'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(citation).toBeFocused();
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Conversation history'}).getByRole('button',{name:'What is the main topic?'})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Ask about a specific section'}).click();
  await page.getByLabel('Range start').fill('02:00');await page.getByLabel('Range end').fill('01:00');
  await page.getByRole('textbox',{name:'Ask ARC',exact:true}).fill('Explain this section');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByRole('alert').filter({hasText:'valid range'})).toBeVisible();
  await page.getByLabel('Range start').fill('00:10');await page.getByLabel('Range end').fill('00:30');
  const ranged=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/chat'));
  await page.getByRole('button',{name:'Send question'}).click();
  expect((await ranged).postDataJSON()).toEqual({question:'Explain this section',start:10,end:30});
});
test('upload, theme persistence, system preference and searchable library',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Upload video file').setInputFiles({name:'lecture.mp4',mimeType:'video/mp4',buffer:Buffer.from('fixture')});
  await expect(page.getByText('lecture.mp4',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Analyze file'}).click();
  await expect(page.getByRole('heading',{name:video.title})).toBeVisible();
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'dark theme',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:'system theme',exact:true}).click();
  await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('link',{name:'Library',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A little more understanding.'})).toBeVisible();
  await page.getByLabel('Search library').fill('missing');await expect(page.getByText('No matching videos.')).toBeVisible();
  await page.getByRole('button',{name:'Clear filters'}).click();await expect(page.getByRole('link',{name:`Open ${video.title}`})).toBeVisible();
});
test('mobile navigation focus, legacy link and recoverable processing failure',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/videos/test-video',route=>route.fulfill({json:{...video,status:'failed',stage:'Processing failed',error:'Free model temporarily unavailable.',analysis:null}}));
  await page.route('**/api/videos/test-video/status',route=>route.fulfill({json:{...video,status:'failed',stage:'Processing failed'}}));
  await page.goto('/?video=test-video');
  await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
  await page.getByText('Failure details').click();await expect(page.getByText('Free model temporarily unavailable.')).toBeVisible();
  await page.getByRole('button',{name:'Open navigation'}).click();
  const drawer=page.getByRole('dialog',{name:'Navigation'});await expect(drawer).toBeVisible();
  await drawer.getByRole('link',{name:'New analysis',exact:true}).click();
  await expect(drawer).toHaveCount(0);await expect(page.getByRole('heading',{name:'Understand every moment.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('processing illustration follows the reported stage, without invented results',async({page})=>{
  let stage='Extracting audio';let status='processing';
  await page.route('**/api/videos/test-video{,/status}',route=>route.fulfill({json:{...video,status,stage,transcript:[],chunks:[],analysis:status==='ready'?video.analysis:null,embedded:0,has_transcript:false}}));
  await page.goto('/video/test-video');await expect(page.getByRole('status')).toContainText('Extracting audio');
  await expect(page.locator('[aria-current=step]')).toHaveText('02Audio');
  stage='Discovering topics · K-Means / PCA';
  await expect(page.getByRole('status')).toContainText('Discovering topics',{timeout:10000});
  await expect(page.locator('[aria-current=step]')).toHaveText('06Topics');
  await expect(page.locator('.processing-facts')).toBeEmpty();
  status='ready';stage='Ready';
  await expect(page.getByText(video.analysis.overview)).toBeVisible({timeout:10000});
});
test('chat failure can retry once requested, and multiline input does not send early',async({page})=>{
  let posts=0;
  await page.route('**/api/videos/test-video/chat',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:[]});posts++;
    if(posts===1)return route.fulfill({status:503,json:{detail:'Free model temporarily unavailable.'}});
    return route.fulfill({json:{role:'assistant',content:'Recovered answer.',citations:[]}});
  });
  await page.goto('/video/test-video/chat');const input=page.getByRole('textbox',{name:'Ask ARC',exact:true});await expect(input).toBeEnabled();
  await input.fill('First line');await input.press('Shift+Enter');await input.pressSequentially('Second line');expect(posts).toBe(0);
  await input.press('Enter');await expect(page.getByRole('alert').filter({hasText:'Unable to reach the analysis model.'})).toBeVisible();
  await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByText('Recovered answer.')).toBeVisible();expect(posts).toBe(2);
});
test('native mini-player seeks after media metadata loads',async({page})=>{
  // A small PCM playback fixture only; no ingestion, speech model or provider execution.
  const pcm=Buffer.alloc(44+8000*2*30);pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(8000,24);pcm.writeUInt32LE(16000,28);pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40);
  await page.route('**/api/videos/test-video',route=>route.fulfill({json:{...video,has_media:true}}));
  await page.route('**/api/videos/test-video/media',route=>{const range=route.request().headers()['range'];const match=range?.match(/bytes=(\d+)-(\d*)/);const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),pcm.length-1):pcm.length-1;return route.fulfill({status:match?206:200,contentType:'audio/wav',headers:{'accept-ranges':'bytes','content-length':String(end-start+1),...(match?{'content-range':`bytes ${start}-${end}/${pcm.length}`}:{})},body:pcm.subarray(start,end+1)});});
  await page.route('**/api/videos/test-video/chat',route=>route.fulfill({json:[{role:'assistant',content:'Saved answer.',citations:[{start:12,end:22,text:'Evidence'}]}]}));
  await page.goto('/video/test-video/chat');await page.getByRole('button',{name:'00:12',exact:true}).click();
  const player=page.getByRole('dialog').locator('video');await expect.poll(()=>player.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThanOrEqual(12);
  await page.getByRole('button',{name:'Close Source moment'}).click();await expect(page.locator('video')).toHaveCount(0);
});
test('responsive sections and reduced motion at mobile, tablet and wide desktop',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [390,768,1920]){
    await page.setViewportSize({width,height:900});
    for(const section of ['topics','chat']){await page.goto(`/video/test-video/${section}`);await expect(page.locator(section==='chat'?'.chat-composer':'.topic-map')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
    expect(await page.locator('.chat-page').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  }
});

test('Hindi and Marathi original/English transcript views preserve seeking and downloads',async({page})=>{
  for(const [language,source,label] of [['mr','आज आपण यंत्र शिक्षणाबद्दल शिकणार आहोत.','Marathi'],['hi','आज हम मशीन लर्निंग के बारे में सीखेंगे।','Hindi']]) {
    const translated={...video,language,transcript:[{start:12,end:22,text:'Today we will learn about machine learning.',original_text:source,translation_language:'en'}]};
    await page.route('**/api/videos/test-video',route=>route.fulfill({json:translated}));
    await page.route('**/api/videos/test-video/status',route=>route.fulfill({json:translated}));
    await page.goto('/video/test-video/transcript');
    const transcript=page.getByRole('region',{name:'Video transcript'});
    await expect(transcript.getByText('Today we will learn about machine learning.',{exact:true})).toBeVisible();
    await transcript.getByRole('button',{name:`Original (${label})`,exact:true}).click();
    await expect(transcript.getByText(source,{exact:true})).toBeVisible();
    await expect(transcript.getByText('Today we will learn about machine learning.',{exact:true})).toHaveCount(0);
    await transcript.getByLabel('Search transcript').fill(source.slice(0,4));
    await expect(transcript.getByRole('button',{name:'00:12',exact:true})).toBeVisible();
    await transcript.getByLabel('Search transcript').fill('');
    await transcript.getByRole('button',{name:'Both',exact:true}).click();
    await expect(transcript.getByText(source,{exact:true})).toBeVisible();
    await expect(transcript.getByText('Today we will learn about machine learning.',{exact:true})).toBeVisible();
    const download=page.waitForEvent('download');
    await transcript.getByRole('button',{name:'Download transcript'}).click();
    expect((await download).suggestedFilename()).toBe('arc-test-video-both.txt');
  }
});

test('language selection is sent with ingestion and pending translation is honest',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Speech language',{exact:true}).selectOption('mr');
  await page.getByLabel('Start with a YouTube link').fill('https://youtu.be/jNQXAC9IVRw');
  const request=page.waitForRequest(r=>r.url().endsWith('/videos/youtube')&&r.method()==='POST');
  await page.getByRole('button',{name:'Analyze',exact:true}).click();
  expect((await request).postDataJSON()).toEqual({url:'https://youtu.be/jNQXAC9IVRw',language:'mr'});
  const original={...video,language:'mr',transcript:[{start:12,end:22,text:'नमस्कार',original_text:'नमस्कार'}]};
  await page.route('**/api/videos/test-video',route=>route.fulfill({json:original}));
  await page.route('**/api/videos/test-video/status',route=>route.fulfill({json:original}));
  await page.goto('/video/test-video/transcript');
  await expect(page.getByText('English translation pending.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Translate to English',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Original (Marathi)',exact:true}).click();
  await expect(page.getByText('नमस्कार',{exact:true})).toBeVisible();
});
