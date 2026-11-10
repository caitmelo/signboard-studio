import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
const sql=new DatabaseSync(':memory:');
sql.exec(fs.readFileSync('drizzle/0000_reflective_cobalt_man.sql','utf8'));
const objects=new Map();
export const env={
 DB:{prepare(query){let values=[];return{bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)??null;},async all(){return{results:sql.prepare(query).all(...values)};},async run(){return sql.prepare(query).run(...values);}};}},
 BUCKET:{async list({prefix='',limit=1000}={}){return {truncated:false,objects:[...objects].filter(([key])=>key.startsWith(prefix)).slice(0,limit).map(([key,value])=>({key,size:value.data.length,customMetadata:value.customMetadata}))};},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);},async put(key,data,options={}){objects.set(key,{data:new Uint8Array(await new Response(data).arrayBuffer()),...options});},async head(key){return objects.has(key)?{size:objects.get(key).data.length,customMetadata:objects.get(key).customMetadata}:null;},async get(key){const object=objects.get(key);if(!object)return null;const{data,...metadata}=object;return{...metadata,body:new Response(data).body,async json(){return JSON.parse(new TextDecoder().decode(data));}};}}
};
