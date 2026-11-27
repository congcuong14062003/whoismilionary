'use strict';

const {normalizeStreamerUsername}=require('./adapters');

function mapChat(data) {
  const user=data && data.user || {};
  const userId=String(user.id||user.userId||user.displayId||user.uniqueId||'');
  const receivedAt=Date.now();
  const rawTime=Number(data?.common?.createTime);
  const sentAt=Number.isFinite(rawTime) && rawTime>0 ? rawTime>1e12?rawTime:rawTime>1e9?rawTime*1000:0 : 0;
  const lag=sentAt?receivedAt-sentAt:null;
  return {
    userId,
    username:String(user.displayId||user.uniqueId||userId),
    nickname:String(user.nickname||user.displayId||user.uniqueId||'Người xem'),
    avatar:String(user.avatarThumb?.urlList?.[0]||user.avatarMedium?.urlList?.[0]||user.profilePictureUrl||''),
    comment:String(data?.content||data?.comment||''),
    timestamp:receivedAt,
    eventId:String(data?.common?.msgId||data?.msgId||''),
    deliveryLagMs:lag!==null&&lag>=-1000&&lag<=300000?Math.max(0,lag):null
  };
}

class DirectLiveAdapter {
  constructor(emit,onStatus,loadLibrary) {
    this.emit=emit;
    this.onStatus=onStatus;
    this.loadLibrary=loadLibrary||(()=>import('tiktok-live-connector'));
    this.connection=null;
    this.timer=null;
    this.desired=false;
    this.generation=0;
    this.retryCount=0;
    this.username='';
    this.status='Chưa kết nối';
  }
  update(status,extra={}) {
    this.status=status;
    this.onStatus({mode:'direct',status,username:this.username,connected:status==='Đã kết nối LIVE',...extra});
  }
  start(input) {
    const username=normalizeStreamerUsername(input);
    this.stop(false);
    this.username=username;
    this.desired=true;
    this.retryCount=0;
    const generation=++this.generation;
    this.attempt(generation);
    return {mode:'direct',status:'Đang kết nối LIVE',username,connected:false};
  }
  async attempt(generation) {
    if(!this.desired||generation!==this.generation)return;
    this.update(this.retryCount?'Đang kết nối lại LIVE':'Đang kết nối LIVE');
    let connection;
    try {
      const {TikTokLiveConnection,WebcastEvent,ControlEvent}=await this.loadLibrary();
      if(!this.desired||generation!==this.generation)return;
      connection=new TikTokLiveConnection(this.username,{processInitialData:false});
      this.connection=connection;
      connection.on(WebcastEvent.CHAT||'chat',data=>{
        if(!this.desired||generation!==this.generation)return;
        const event=mapChat(data);
        if(event.userId&&event.comment)this.emit(event);
      });
      connection.on(ControlEvent.DISCONNECTED||'disconnected',()=>this.retry(generation,'Mất kết nối LIVE'));
      connection.on(ControlEvent.ERROR||'error',error=>this.retry(generation,`Lỗi kết nối: ${String(error?.message||error).slice(0,100)}`));
      connection.on(WebcastEvent.STREAM_END||'streamEnd',()=>this.retry(generation,'Kênh đã kết thúc LIVE'));
      const state=await connection.connect();
      if(!this.desired||generation!==this.generation||connection!==this.connection){await Promise.resolve().then(()=>connection.disconnect()).catch(()=>{});return;}
      if(this.timer){clearTimeout(this.timer);this.timer=null;}
      this.retryCount=0;
      this.update('Đã kết nối LIVE',{roomId:String(state?.roomId||connection.roomId||'')});
    } catch(error) {
      if(!this.desired||generation!==this.generation)return;
      this.retry(generation,`Chưa kết nối: ${String(error?.message||error).slice(0,120)}`);
    }
  }
  retry(generation,reason) {
    if(!this.desired||generation!==this.generation||this.timer)return;
    const delay=15000;
    this.retryCount++;
    const old=this.connection;this.connection=null;
    this.update(`${reason}. Thử lại sau ${delay/1000} giây`,{connected:false,roomId:''});
    if(old)Promise.resolve().then(()=>old.disconnect()).catch(()=>{});
    this.timer=setTimeout(()=>{this.timer=null;this.attempt(generation);},delay);
  }
  stop(publish=true) {
    this.desired=false;
    this.generation++;
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    const old=this.connection;this.connection=null;
    if(old)Promise.resolve().then(()=>old.disconnect()).catch(()=>{});
    if(publish)this.update('Đã ngắt kết nối LIVE',{connected:false,roomId:''});
  }
}

module.exports={DirectLiveAdapter,mapChat};
