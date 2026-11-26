import numpy as np, colorsys, math, sys
from PIL import Image, ImageFilter, ImageDraw
from collections import deque
import os
# 실행: python3 tools/makeShinyPets.py 종,종 1,2,3 --save  (미리보기 shiny_sheet.png: 왼쪽 보통, 오른쪽 색다른)
SRC=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'pets')
# 종마다 바꿀 색: (원래 색상 중심°, 폭°, 새 색상°(None=그대로), 채도 배수, 명도 배수)
RULES={
 'emberkit':  [(26,30,212,0.85,1.06,0.42),(48,14,192,0.8,1.08,0.5)],          # 주황 몸·불꽃 → 푸른 불꽃
 'dropotter': [(205,40,330,0.9,1.05)],                             # 파랑 → 분홍
 'sproutdeer':[(95,40,32,1.05,1.0),(340,25,265,1.0,1.0)],          # 초록 → 단풍 주황, 분홍 꽃 → 보라
 'zapowl':    [(50,18,160,0.85,1.0),(30,14,175,0.8,0.95)],         # 노랑 → 민트, 갈색 날개 → 청록
 'snowbun':   [(200,40,275,1.6,1.0)],                              # 하늘색 얼음 → 보라 얼음
 'pebbletle': [(38,30,350,1.3,1.0),(0,0,None,1,1)],                # 황토 → 장밋빛
 'stardrake': [(268,40,None,0.25,0.62),(48,16,355,1.1,1.0)],       # 보라 → 흑요석, 금색 → 붉은색
 'punchroo':  [(28,22,210,0.35,1.02),(358,14,218,0.95,1.0)],       # 주황 털 → 은회색, 빨강 장갑·머리띠 → 파랑
 'heartail':  [(350,28,268,0.9,1.0,0.08),(150,48,46,1.25,1.0,0.05)],  # 분홍 털 → 라벤더, 초록 하트 → 금빛 하트
 'ironpaw':   [(215,35,28,2.2,1.05,0.06)],                          # 푸른 회색 털 → 황금 갈색(은빛 갑옷은 그대로)
 'bellpup':   [(170,50,330,1.0,1.02,0.08)],                         # 민트·하늘 털 → 분홍(금방울은 그대로)
}
AURA={'emberkit':(120,170,255),'dropotter':(255,150,210),'sproutdeer':(255,180,90),'zapowl':(120,255,210),'snowbun':(200,160,255),'pebbletle':(255,150,170),'stardrake':(255,90,90),'punchroo':(140,190,255),'heartail':(255,220,120),'ironpaw':(255,200,90),'bellpup':(255,160,200)}

def hue_dist(h,c):
    d=np.abs(h-c)%360
    return np.minimum(d,360-d)

def recolor(img, rules):
    a=np.asarray(img).astype(np.float32)/255
    rgb=a[:,:,:3]; al=a[:,:,3]
    mx=rgb.max(2); mn=rgb.min(2); v=mx; c=mx-mn
    s=np.where(mx>0,c/np.maximum(mx,1e-6),0)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    h=np.zeros_like(mx)
    m=c>1e-6
    hr=((g-b)/np.maximum(c,1e-6))%6; hg=(b-r)/np.maximum(c,1e-6)+2; hb=(r-g)/np.maximum(c,1e-6)+4
    h=np.where(mx==r,hr,np.where(mx==g,hg,hb))*60
    h=np.where(m,h,0)
    nh,ns,nv=h.copy(),s.copy(),v.copy()
    # 테두리·눈동자처럼 어둡고 진한 곳은 그대로 둬요.
    keep=(v<0.36)
    for rule in rules:
        cen,wid,to,sm,vm=rule[:5]; smin=rule[5] if len(rule)>5 else 0.12
        if wid==0: continue
        dist=hue_dist(h,cen)
        w=np.clip(1-(dist-wid*0.6)/(wid*0.4+1e-6),0,1)*np.clip((s-smin)/0.12,0,1)*(~keep)
        if to is not None:
            nh=np.where(w>0, (h+((to-cen+540)%360-180)*w)%360, nh)
        ns=ns*(1-w)+np.clip(s*sm,0,1)*w
        nv=nv*(1-w)+np.clip(v*vm,0,1)*w
    # HSV → RGB
    C=nv*ns; X=C*(1-np.abs((nh/60)%2-1)); M=nv-C
    seg=(nh//60).astype(int)%6
    z=np.zeros_like(C)
    R=np.choose(seg,[C,X,z,z,X,C]); G=np.choose(seg,[X,C,C,X,z,z]); B=np.choose(seg,[z,z,X,C,C,X])
    out=np.dstack([R+M,G+M,B+M,al])
    return Image.fromarray((np.clip(out,0,1)*255).astype(np.uint8),'RGBA')

def eye_highlights(img):
    a=np.asarray(img).astype(int); H,W,_=a.shape
    al=a[:,:,3]; ys,xs=np.nonzero(al>40); top,bot=ys.min(),ys.max()
    white=(al>200)&(a[:,:,:3].min(2)>=238)
    dark=(a[:,:,:3].max(2)<110)&(al>200)
    seen=np.zeros((H,W),bool); found=[]
    lim=top+(bot-top)*0.55
    for y in range(top,int(lim)):
        for x in range(W):
            if white[y,x] and not seen[y,x]:
                q=deque([(y,x)]); seen[y,x]=True; pts=[]
                while q:
                    p=q.popleft(); pts.append(p)
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        n=(p[0]+dy,p[1]+dx)
                        if 0<=n[0]<H and 0<=n[1]<W and white[n] and not seen[n]: seen[n]=True; q.append(n)
                if 6<=len(pts)<=260:
                    py=np.mean([p[0] for p in pts]); px=np.mean([p[1] for p in pts])
                    # 눈 하이라이트: 주변에 짙은 눈동자가 많아요
                    y0,y1,x0,x1=int(py-14),int(py+14),int(px-14),int(px+14)
                    win=dark[max(0,y0):y1,max(0,x0):x1]
                    if win.mean()>0.22: found.append((len(pts),px,py))
    found.sort(reverse=True)
    # 가장 큰 두 개(두 눈)만, 서로 떨어져 있어야 해요
    eyes=[]
    for f in found:
        if all(abs(f[1]-e[1])>25 for e in eyes): eyes.append(f)
        if len(eyes)==2: break
    return eyes

def sparkle(d, x, y, r, col=(255,255,255,255)):
    pts=[]
    for i in range(8):
        a=-math.pi/2+i*math.pi/4; rr=r if i%2==0 else r*0.28
        pts.append((x+math.cos(a)*rr, y+math.sin(a)*rr))
    d.polygon(pts, fill=col)

def make(sp, st):
    base=Image.open(f'{SRC}/{sp}_{st}.webp').convert('RGBA')
    pet=recolor(base, RULES[sp])
    # 눈을 반짝반짝 별 모양으로(표정 바꾸기)
    eyes=eye_highlights(base)
    over=Image.new('RGBA',pet.size,(0,0,0,0)); d=ImageDraw.Draw(over)
    for (n,x,y) in eyes:
        r=max(7,min(16,math.sqrt(n)*1.6))
        sparkle(d,x,y,r*1.15,(255,255,255,255))
        sparkle(d,x+r*0.85,y+r*1.35,r*0.5,(255,255,255,230))
    if len(eyes)==2:
        (n1,x1,y1),(n2,x2,y2)=eyes
        gap=abs(x2-x1)
        bl=Image.new('RGBA',pet.size,(0,0,0,0)); bd=ImageDraw.Draw(bl)
        for (x,y,dx) in ((x1,y1,-1 if x1<x2 else 1),(x2,y2,-1 if x2<x1 else 1)):
            cx=x+dx*gap*0.28; cy=y+gap*0.5
            bd.ellipse((cx-gap*0.2,cy-gap*0.1,cx+gap*0.2,cy+gap*0.1),fill=(255,110,140,120))
        bl=bl.filter(ImageFilter.GaussianBlur(3))
        a=np.asarray(bl).copy(); a[:,:,3]=np.minimum(a[:,:,3],np.asarray(pet)[:,:,3]); bl=Image.fromarray(a)
        pet=Image.alpha_composite(pet,bl)
    pet=Image.alpha_composite(pet,over)
    # 조금 줄여서 아우라 자리를 만들어요
    k=0.86; small=pet.resize((int(512*k),int(512*k)),Image.LANCZOS)
    layer=Image.new('RGBA',(512,512),(0,0,0,0)); ox=(512-small.width)//2; oy=512-small.height-6
    layer.alpha_composite(small,(ox,oy))
    # 아우라: 몸 모양을 따라 번지는 빛
    al=layer.split()[3].filter(ImageFilter.MaxFilter(17)).filter(ImageFilter.GaussianBlur(14))
    col=AURA[sp]
    glow=Image.new('RGBA',(512,512),col+(0,)); glow.putalpha(al.point(lambda v:int(v*0.85)))
    al2=layer.split()[3].filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4))
    rim=Image.new('RGBA',(512,512),(255,255,255,0)); rim.putalpha(al2.point(lambda v:int(v*0.55)))
    out=Image.new('RGBA',(512,512),(0,0,0,0)); out.alpha_composite(glow); out.alpha_composite(rim); out.alpha_composite(layer)
    # 주변 반짝이
    d=ImageDraw.Draw(out)
    ys,xs=np.nonzero(np.asarray(layer.split()[3])>40)
    t,b,l,r_=ys.min(),ys.max(),xs.min(),xs.max()
    for (fx,fy,rr) in [(0.06,0.18,13),(0.94,0.3,10),(0.1,0.62,8),(0.9,0.74,12),(0.5,0.02,9)]:
        x=l+(r_-l)*fx; y=t+(b-t)*fy
        sparkle(d,x,y,rr+3,col+(255,)); sparkle(d,x,y,rr,(255,255,255,255))
    return out, len(eyes)

if __name__=='__main__':
    sps=sys.argv[1].split(',') if len(sys.argv)>1 else list(RULES)
    stages=[int(x) for x in (sys.argv[2].split(',') if len(sys.argv)>2 else ['2'])]
    sheet=Image.new('RGBA',(256*len(stages)*2,256*len(sps)),(30,41,59,255))
    for i,sp in enumerate(sps):
        for j,st in enumerate(stages):
            o,ne=make(sp,st)
            if '--save' in sys.argv: o.save(f'{SRC}/{sp}_{st}_s.webp','WEBP',quality=90)
            print(sp,st,'eyes',ne)
            sheet.alpha_composite(Image.open(f'{SRC}/{sp}_{st}.webp').convert('RGBA').resize((256,256)),(j*512,i*256))
            sheet.alpha_composite(o.resize((256,256),Image.LANCZOS),(j*512+256,i*256))
    sheet.save('shiny_sheet.png')
