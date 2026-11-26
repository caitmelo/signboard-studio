import {prepareImage} from './template-media';
self.onmessage=async(event:MessageEvent)=>{
 try{const {name,table,pixels}=event.data;const result=await prepareImage(new Uint8Array(),name,table,pixels);self.postMessage({result}, {transfer:[result.pdf.buffer]});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:'Photo preparation failed.'});}
};
