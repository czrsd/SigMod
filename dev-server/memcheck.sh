#!/bin/bash
echo "=== top 25 processes by RSS (resident memory) ==="
ps -eo rss,user,comm,args --sort=-rss --no-headers | head -25 | awk '{
  mb=$1/1024
  $1=""
  printf "%8.0f MB  %-10s %s\n", mb, $2, substr($0, index($0,$3))
}'
echo
echo "=== memory grouped by process name (top 15) ==="
ps -eo rss,comm --no-headers | awk '
{ mem[$2]+=$1; count[$2]++ }
END { for (k in mem) printf "%10.0f MB  %4d procs  %s\n", mem[k]/1024, count[k], k }
' | sort -rn | head -15
echo
echo "=== docker container memory ==="
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null
echo
echo "=== pm2 process memory ==="
pm2 jlist 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=sorted(d,key=lambda x:-x['monit']['memory'])
for p in rows:
    print(f\"{p['monit']['memory']/1048576:7.0f} MB  {p['name']:28s} {p['pm2_env'].get('exec_cwd','')}\")
" 2>/dev/null
echo
echo "=== system total ==="
free -h
