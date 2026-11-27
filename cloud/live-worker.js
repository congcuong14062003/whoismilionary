'use strict';
const crypto=require('crypto');
const {DirectLiveAdapter}=require('../direct-live');
class CloudLiveWorker{
 constructor(store,Adapter=DirectLiveAdapter){this.store=store;this.Adapter=Adapter;this.refs=0;this.actor=null;this.nextLeaseCheck=0;this.syncing=null;}
 retain(){this.refs++;}
 async release(){this.refs=Math.max(0,this.refs-1);if(!this.refs)await this.stop();}
 async stop(){const actor=this.actor;this.actor=null;this.nextLeaseCheck=0;if(!actor)return;actor.adapter.stop(false);await this.store.releaseWorker(actor.token).catch(()=>{});}
 sync(username){
  if(this.syncing)return this.syncing;
  this.syncing=this.update(username).finally(()=>this.syncing=null);return this.syncing;
 }
 async update(username){
  if(!this.refs)return;
  if(!username){await this.stop();return;}
  if(this.actor&&this.actor.username!==username)await this.stop();
  if(Date.now()<this.nextLeaseCheck)return;
  this.nextLeaseCheck=Date.now()+5000;
  const token=this.actor?.token||crypto.randomUUID();
  if(!await this.store.claimWorker(token)){await this.stop();this.nextLeaseCheck=Date.now()+5000;return;}
  if(this.actor)return;
  const actor={token,username,adapter:null};this.actor=actor;
  const write=fn=>{if(this.actor!==actor)return;return this.store.mutate(ctx=>{if(ctx.desiredUsername!==username||this.actor!==actor)return;fn(ctx.game);ctx.game.changed();},{leaseToken:token}).catch(error=>{console.error('LIVE state update:',error.message);});};
  actor.adapter=new this.Adapter(event=>write(game=>{
   const result=game.comment(event);game.connection.received=(game.connection.received||0)+1;game.connection.lastEventAt=Date.now();
   game.connection.lastComment={name:event.nickname||event.username,content:event.comment,accepted:result.accepted,reason:result.reason||''};game.connection.deliveryLagMs=event.deliveryLagMs;
  }),connection=>write(game=>{game.connection={...game.connection,...connection};}));
  actor.adapter.start(username);
 }
}
module.exports={CloudLiveWorker};
