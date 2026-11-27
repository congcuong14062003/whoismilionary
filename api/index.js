'use strict';
const {CloudStore}=require('../cloud/store');
const {CloudLiveWorker}=require('../cloud/live-worker');
const {createHandler}=require('../cloud/handler');
const store=new CloudStore();
module.exports=createHandler({store,worker:new CloudLiveWorker(store)});
