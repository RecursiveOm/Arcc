import { test, expect } from '@playwright/test';
const video={id:'test-video',title:'Understanding vector search',source_type:'upload',duration:120,created_at:'2026-09-21T00:00:00Z',status:'ready',stage:'Ready',has_media:false,embedded:1,language:'en',transcript:[{start:12,end:22,text:'Vectors represent semantic meaning.'}],chunks:[],analysis:{overview:'A video about semantic search.',detailed_summary:[{title:'Search',content:'Vectors help find similar ideas.'}],key_takeaways:['Meaning improves retrieval.'],study_notes:[{title:'Embedding',content:'A numerical representation of meaning.'}],chapters:[{start:12,title:'Vector search',description:'How retrieval works.'}],important_moments:[],topics:['Retrieval'],entities:['Vectors']},ml:{num_clusters:1,silhouette_score:null,topics:[{cluster_id:0,label:'Retrieval',representative_chunk_ids:[]}],points:[{chunk_id:0,start:12,end:22,cluster_id:0,x:0,y:0}]}};
test.beforeEach(async({page})=>{
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    let body:unknown={};
    if(url.pathname==='/api/settings')body={deepseek_configured:true,whisper_model:'small',ffmpeg_available:true,max_upload_mb:1024};
    else if(url.pathname==='/api/videos')body=[video];
    else if(url.pathname.endsWith('/chat'))body=route.request().method()==='POST'?{role:'assistant',content:'The video discusses semantic retrieval.',citations:[{start:12,end:22,text:'Evidence'}]}:[];
    else body=video;
    await route.fulfill({json:body});
  });
});
test('new video, analysis tabs, grounded chat and range validation',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Understand every moment.'})).toBeVisible();
  await page.getByLabel('Start with a YouTube link').fill('https://youtu.be/jNQXAC9IVRw');
  await page.getByRole('button',{name:'Analyze',exact:true}).click();
  await expect(page.getByRole('heading',{name:video.title})).toBeVisible();
  await expect(page.getByText(video.analysis.overview)).toBeVisible();
  await page.getByRole('tab',{name:'Transcript',exact:true}).click();
  await expect(page.getByText('Vectors represent semantic meaning.')).toBeVisible();
  await page.getByRole('tab',{name:'Topic Map'}).click();
  await expect(page.getByRole('button',{name:'Seek 00:12, topic 1'})).toBeVisible();
  await page.getByLabel('Ask ARC', {exact:true}).fill('What is the main topic?');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByText('The video discusses semantic retrieval.')).toBeVisible();
  await expect(page.getByRole('button',{name:'00:12',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ask about a specific section'}).click();
  await page.getByLabel('Range start').fill('02:00');
  await page.getByLabel('Range end').fill('01:00');
  await page.getByLabel('Ask ARC',{exact:true}).fill('Explain this section');
  await page.getByRole('button',{name:'Send question'}).click();
  await expect(page.getByRole('alert').filter({hasText:'valid range'})).toBeVisible();
});
test('upload selection, theme persistence, library',async({page})=>{
  await page.goto('/');
  await page.getByLabel('Upload video file').setInputFiles({name:'lecture.mp4',mimeType:'video/mp4',buffer:Buffer.from('fixture')});
  await expect(page.getByText('lecture.mp4',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Analyze file'}).click();
  await expect(page.getByRole('heading',{name:video.title})).toBeVisible();
  await page.getByRole('button',{name:'dark theme',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.getByRole('button',{name:/Your library/}).click();
  await expect(page.getByRole('heading',{name:'Your library'})).toBeVisible();
});
test('mobile drawer and failed processing state',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/videos/test-video',route=>route.fulfill({json:{...video,status:'failed',stage:'Processing failed',error:'DeepSeek key is missing.',analysis:null}}));
  await page.goto('/?video=test-video');
  await expect(page.getByRole('button',{name:'Retry'})).toBeVisible();
  await expect(page.getByText('DeepSeek key is missing.')).toBeVisible();
  await page.getByRole('button',{name:'Open navigation'}).click();
  await page.getByRole('button',{name:'New video',exact:false}).click();
  await expect(page.getByRole('heading',{name:'Understand every moment.'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
