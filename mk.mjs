import {createClient} from '@libsql/client';const c=createClient({url:'file:/tmp/l3.db'});
await c.batch(["create table if not exists daemons(id int)","insert into daemons values(1)","alter table events add column data text","delete from meta where k='schema'"]);
