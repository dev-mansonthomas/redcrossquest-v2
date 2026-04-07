# 

[**Resync firebase uid & provider	1**](#resync-firebase-uid-&-provider)

[**Manually Create Test account	2**](#manually-create-test-account)

[**Calcul par quêteur : montant collecté par jour, le cumulé par jour et le all\_time\_total	5**](#calcul-par-quêteur-:-montant-collecté-par-jour,-le-cumulé-par-jour-et-le-all_time_total)

[**Pour chaque quêteur, calcule le nombre d’année consécutive de quête, trié par ce nombre descendant	6**](#pour-chaque-quêteur,-calcule-le-nombre-d’année-consécutive-de-quête,-trié-par-ce-nombre-descendant)

[**All Time Collected avec RCQ et le nombre d’UL ayant utilisé RCQ (avec des troncs comptés)	8**](#all-time-collected-avec-rcq-et-le-nombre-d’ul-ayant-utilisé-rcq-\(avec-des-troncs-comptés\))

# 

# 

# 

# Resync firebase uid & provider {#resync-firebase-uid-&-provider}

Context : missing firebase uid & provider in the create queteur upon RedQuest registration approval. 

select  tqa.id,  
		tqa.queteur\_id,  
		concat(q.first\_name, ' ', q.last\_name , ' ', u.name) as queteur\_details,  
		tqa.comptage,  
		round(sum(tqa.total\_tq) ,2) as tronc\_queteur\_total,  
		round(sum(sum(tqa.total\_tq)) over(partition by tqa.queteur\_id order by tqa.comptage asc),2) as cumulative\_total,  
		round(sum(sum(tqa.total\_tq)) over(partition by tqa.queteur\_id)							,2) as all\_time\_total  
from tq\_amount tqa  
join queteur q on tqa.queteur\_id \= q.id  
join ul u on q.ul\_id \= u.id  
where tqa.comptage is not null  
group by tqa.id, queteur\_details, tqa.queteur\_id,tqa.comptage  
order by all\_time\_total desc, tqa.queteur\_id,tqa.comptage;

this query show the missing data in quêeteur table

select  qr.id, q.id, queteur\_id, qr.firebase\_uid, qr.firebase\_sign\_in\_provider, q.firebase\_uid, q.firebase\_sign\_in\_provider  
from queteur\_registration qr, queteur q  
where qr.queteur\_id \= q.id  
and qr.firebase\_uid is not null  
and q.firebase\_uid is null  
order by qr.id desc;

This one fixes the issue. Note : there can be multiple registration for the same queteur, that’s why there’s an order by qr.id desc limit 1

update queteur q  
set q.firebase\_sign\_in\_provider \= (select qr.firebase\_sign\_in\_provider from queteur\_registration qr where qr.queteur\_id \= q.id order by qr.id desc limit 1),  
   q.firebase\_uid              \= (select qr.firebase\_uid from queteur\_registration qr where qr.queteur\_id \= q.id  order by qr.id desc   limit 1)  
where q.firebase\_uid is not null;

# Manually Create Test account {#manually-create-test-account}

Usecase: comptes créé en production, mais erreur en test (ex: site de test pas démarré)

1. select \*  from ul where id \= 353;  
   1. Switch to SQL update statement  
      ![][image1]  
   2. Copy the row (right click on the row number, copy)  
   3. Paste it in the TEST window, change or remove the DB name and run the query  
2. select \*  from queteur where ul\_id \= 353;  
   1. Switch to SQL INSERT statement  
   2. Copy the row, paste it in the TEST window  
   3. REMOVE the ID Column name and value  
   4. Run the query  
   5. Run the following query to know which queteurID has been assigned to the new row  
   6. select \*  from queteur where ul\_id \= 353 order by id desc;  
3. User  
   1. select \* from users where queteur\_id\=XXXX; (XXX from previous query)  
   2. copy the row, paste it in the test window  
   3. remove the ID column & value  
   4. update the queteurID  
   5. run the query

Classement des quêteurs par bénévole d'un jour ayant quêter en 2022  
select  *count*(distinct(q.id)), q\_ref.id, q\_ref.first\_name, q\_ref.last\_name  
from tronc\_queteur tq, queteur q, queteur q\_ref  
where tq.queteur\_id \= q.id  
and q.referent\_volunteer \= q\_ref.id  
and q.referent\_volunteer \> 0  
and q.ul\_id\=351  
and *year*(depart) \= 2022  
and q.nivol \=''  
and deleted \= 0  
group by q\_ref.id  
order by *count*(distinct(q.id)) desc;

Classement des quêteurs par nombre de fois où ils sont venu quêteur  
select  *count*(distinct(*day*(comptage))), q.first\_name, q.last\_name  
from tronc\_queteur tq, queteur q  
where tq.queteur\_id \= q.id  
and q.ul\_id\=351  
and *year*(depart) \= 2022  
and comptage is not null  
and deleted \= 0  
group by q.first\_name, q.last\_name  
order by *count*(distinct(*day*(comptage))) desc;

Stats par queteur

select  
   tq.ul\_id,  
   tq.queteur\_id,  
   *SUM*(  
     tq.euro2   \* 2    \+  
     tq.euro1   \* 1    \+  
     tq.cents50 \* 0.5  \+  
     tq.cents20 \* 0.2  \+  
     tq.cents10 \* 0.1  \+  
     tq.cents5  \* 0.05 \+  
     tq.cents2  \* 0.02 \+  
     tq.cent1   \* 0.01 \+  
     tq.euro5   \* 5    \+  
     tq.euro10  \* 10   \+  
     tq.euro20  \* 20   \+  
     tq.euro50  \* 50   \+  
     tq.euro100 \* 100  \+  
     tq.euro200 \* 200  \+  
     tq.euro500 \* 500  \+  
     tq.don\_cheque     \+  
     tq.don\_creditcard  
   ) as amount,  
   *SUM*(tq.don\_creditcard) as amount\_cb,  
   (select  amount  
    from    yearly\_goal yg  
    where   yg.ul\_id \= tq.ul\_id  
    and     year \= *EXTRACT*(YEAR from *max*(tq.depart))) amount\_year\_objective,  
   *SUM*((  
     tq.euro500 \* 1.1  \+  
     tq.euro200 \* 1.1  \+  
     tq.euro100 \* 1    \+  
     tq.euro50  \* 0.9  \+  
     tq.euro20  \* 0.8  \+  
     tq.euro10  \* 0.7  \+  
     tq.euro5   \* 0.6  \+  
     tq.euro2   \* 8.5  \+  
     tq.euro1   \* 7.5  \+  
     tq.cents50 \* 7.8  \+  
     tq.cents20 \* 5.74 \+  
     tq.cents10 \* 4.1  \+  
     tq.cents5  \* 3.92 \+  
     tq.cents2  \* 3.06 \+  
     tq.cent1   \* 2.3)  
   ) as weight,  
   *SUM*(*TIMESTAMPDIFF*(MINUTE, tq.depart, tq.retour )) as time\_spent\_in\_minutes,  
   *count*(1)                           as number\_of\_tronc\_queteur,  
   *count*(distinct(tq.point\_quete\_id)) as number\_of\_point\_quete,  
   (select *count*(1) from point\_quete pq where pq.ul\_id \= tq.ul\_id) as total\_number\_of\_point\_quete,  
   (select *count*(distinct(*EXTRACT*(DAY from tqq.depart)))  
    from tronc\_queteur tqq  
    where tqq.queteur\_id \= tq.queteur\_id  
    and *EXTRACT*(YEAR from tqq.depart) \= *EXTRACT*(YEAR from tq.depart)) as number\_of\_days\_quete,  
   q.first\_name,  
   q.last\_name,  
   *EXTRACT*(YEAR from tq.depart) as year  
 from tronc\_queteur as tq,  
      queteur       as q  
 where tq.ul\_id      \= 595  
 AND   tq.queteur\_id \= q.id  
 AND    q.active     \= true  
 AND   tq.deleted    \= false  
 AND   tq.comptage is not null  
 group by tq.ul\_id, tq.queteur\_id, q.first\_name, q.last\_name,  year  
order by amount desc  
;

# Calcul par quêteur : montant collecté par jour, le cumulé par jour et le all\_time\_total {#calcul-par-quêteur-:-montant-collecté-par-jour,-le-cumulé-par-jour-et-le-all_time_total}

\-- Calcule par queteur, la quantité d'€ collecté par jour, le cumulé par jour et le all time total  
\-- trié par all\_time\_total desc  
**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.deleted \= 0  
  **and** 	 *tq*.comptage **is** **not** **null**  
)  
**select**  *tqa*.id,  
		*tqa*.queteur\_id,  
		**concat**(*q*.first\_name, **' '**, *q*.last\_name , **' '**, *u*.name) **as** *queteur\_details*,  
		*tqa*.comptage,  
		**round**(**sum**(*tqa*.*total\_tq*) ,2) **as** *tronc\_queteur\_total*,  
		**round**(**sum**(**sum**(*tqa*.*total\_tq*)) **over**(**partition** **by** *tqa*.queteur\_id **order** **by** *tqa*.comptage **asc**),2) **as** *cumulative\_total*,  
		**round**(**sum**(**sum**(*tqa*.*total\_tq*)) **over**(**partition** **by** *tqa*.queteur\_id)							,2) **as** *all\_time\_total*  
**from** *tq\_amount* *tqa*  
**join** queteur *q* **on** *tqa*.queteur\_id \= *q*.id  
**join** ul *u* **on** *q*.ul\_id \= *u*.id  
**group** **by** *tqa*.id, *queteur\_details*, *tqa*.queteur\_id,*tqa*.comptage  
**order** **by** *all\_time\_total* **desc**, *tqa*.queteur\_id,*tqa*.comptage;

# Pour chaque quêteur, calcule le nombre d’année consécutive de quête, trié par ce nombre descendant {#pour-chaque-quêteur,-calcule-le-nombre-d’année-consécutive-de-quête,-trié-par-ce-nombre-descendant}

\-- Calcule le nombre d'années consécutive quété par queteur  
\-- trié par order descendant du nombre d'années de quete consécutive  
**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.comptage **is** **not** **null**  
  **and** *tq*.deleted \= 0  
),  
*somme\_par\_queteur\_annee* **as** (  
	**SELECT** *tqa*.queteur\_id,  
		   *tqa*.ul\_id,  
		   **extract**(**year** **from** *tqa*.comptage) **as** *annee\_quetee*,  
		   **sum**(*tqa*.*total\_tq*) **as** *total\_don\_annuel*  
	**from** *tq\_amount* *tqa*  
	**group** **by** *tqa*.queteur\_id, *tqa*.ul\_id, *annee\_quetee*  
),  
*quete\_precedente* **as** (  
	**SELECT** 	*sqa*.queteur\_id,  
			*sqa*.ul\_id,  
			*sqa*.*annee\_quetee*,  
			**lag**(*sqa*.*annee\_quetee*,1,0) **over**(**partition** **by** *sqa*.queteur\_id **order** **by** *sqa*.*annee\_quetee*) **as** *annee\_precedente*  
	**from** *somme\_par\_queteur\_annee* *sqa*  
	**where** *total\_don\_annuel* \> 0  
),  
*quete\_consecutive* **as** (  
	**select** 	*qp*.queteur\_id,  
			*qp*.ul\_id,  
			*qp*.*annee\_quetee*,  
			**CASE**  
					**when** *qp*.*annee\_precedente* **is** **null** **or** *qp*.*annee\_quetee* \-1 \<\> *qp*.*annee\_precedente* **then** 1 \-- nouvelle séquence  
					**else** 0  
			**END**	 **as** *nouvelle\_sequence*		  
	**from** *quete\_precedente* *qp*  
),  
*SequencesAvecCumul* **AS** (  
   **SELECT**  
       *qc*.queteur\_id,  
       *qc*.ul\_id,  
       *qc*.*annee\_quetee*,  
       **SUM**(*qc*.*nouvelle\_sequence*) **OVER** (**PARTITION** **BY** *qc*.queteur\_id **ORDER** **BY** *qc*.*annee\_quetee*) **AS** *num\_sequence*  
   **FROM**  
       *quete\_consecutive* *qc*  
)  
**SELECT**  
   *sac*.queteur\_id,  
   *sac*.ul\_id,  
   **concat**(*q*.first\_name, **' '**, *q*.last\_name , **' '**, *u*.name) **as** *queteur\_details*,  
   **COUNT**(**DISTINCT** *sac*.*annee\_quetee*) **AS** *annees\_consecutives*  
**FROM**  
   *SequencesAvecCumul* *sac*  
**JOIN** queteur *q* **on** *q*.id \= *sac*.queteur\_id  
**join** ul *u* **on** *sac*.ul\_id \= *u*.id  
**GROUP** **BY**  
   *sac*.queteur\_id, *sac*.ul\_id, *num\_sequence*  
**ORDER** **BY**  
   *annees\_consecutives* **desc**;

# All Time Collected avec RCQ et le nombre d’UL ayant utilisé RCQ (avec des troncs comptés) {#all-time-collected-avec-rcq-et-le-nombre-d’ul-ayant-utilisé-rcq-(avec-des-troncs-comptés)}

\-- calcule le cumul collecté via RCQ depuis son lancement toute UL confondue  
**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.deleted \= 0  
  **and** *tq*.comptage **is** **not** **null**  
),  
*all\_time\_total* **as** (  
**select**  *tqa*.ul\_id,  
		*u*.name **as** *ul\_name*,  
		**sum**(**sum**(*tqa*.*total\_tq*)) **over**(**partition** **by** tqa.ul\_id)	 **as** all\_time\_total  
**from** *tq\_amount* *tqa*  
**join** ul *u* **on** *tqa*.ul\_id \= *u*.id  
**group** **by** *tqa*.ul\_id, *ul\_name*  
**order** **by** ***all\_time\_total*** **desc**  
)  
**Select** **round**(**sum**(*att*.***all\_time\_total***),2)  
**from** *all\_time\_total* *att*  
;  
\-- calcule le cumulé par jour, le cumulé total et le total par tronc de collecte par UL  
**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.deleted \= 0  
  **and** *tq*.comptage **is** **not** **null**  
),  
*all\_time\_total* **as** (  
**select**  *tqa*.ul\_id,  
		*u*.name **as** *ul\_name*,  
		**round**(**sum**(**sum**(*tqa*.*total\_tq*)) **over**(**partition** **by** *tqa*.ul\_id),2) **as** *all\_time\_total*  
**from** *tq\_amount* *tqa*  
**join** ul *u* **on** *tqa*.ul\_id \= *u*.id  
**where** *tqa*.comptage **is** **not** **null**  
**group** **by** *tqa*.ul\_id, *ul\_name*  
**order** **by** *all\_time\_total* **desc**  
)  
**Select** \*  
**from** *all\_time\_total* *att*  
;

# Temps total en heures

**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    TIMESTAMPDIFF(**SECOND** , *tq*.depart, *tq*.retour) **AS** *duree*,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.deleted \= 0  
  **and** 	 *tq*.comptage **is** **not** **null**  
)  
**select**  **ROUND**(**SUM**(*duree*)/3600,2)  
**from** *tq\_amount* *tqa*  
**where** *total\_tq* \> 0;

# Poids total en grammes

\-- calcule le cumulé par jour, le cumulé total et le total par tronc de collecte par UL  
**with** *cc\_weight* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**count**(*cc*.id) **as** *cc\_weight\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_weight* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro500 \* 1.1  \+  
    *tq*.euro200 \* 1.1  \+  
    *tq*.euro100 \* 1    \+  
    *tq*.euro50  \* 0.9  \+  
    *tq*.euro20  \* 0.8  \+  
    *tq*.euro10  \* 0.7  \+  
    *tq*.euro5   \* 0.6  \+  
    *tq*.euro2   \* 8.5  \+  
    *tq*.euro1   \* 7.5  \+  
    *tq*.cents50 \* 7.8  \+  
    *tq*.cents20 \* 5.74 \+  
    *tq*.cents10 \* 4.1  \+  
    *tq*.cents5  \* 3.92 \+  
    *tq*.cents2  \* 3.06 \+  
    *tq*.cent1   \* 2.3  \+  
    **COALESCE**(*ccw*.*cc\_weight\_per\_tq*, 0) \* 0.4  
    **as** *total\_weight\_tq*  
  **from** tronc\_queteur *tq*  
  **LEFT** **JOIN** *cc\_weight* *ccw* **ON** *ccw*.tronc\_queteur\_id \= *tq*.id  
),  
*all\_time\_total* **as** (  
**select**  *tqw*.ul\_id,  
		*u*.name **as** *ul\_name*,  
		**round**(**sum**(**sum**(*tqw*.*total\_weight\_tq*)) **over**(**partition** **by** *tqw*.ul\_id)					,2) **as** *all\_time\_total*  
**from** *tq\_weight* *tqw*  
**join** ul *u* **on** *tqw*.ul\_id \= *u*.id  
**where** *tqw*.comptage **is** **not** **null**  
**group** **by** *tqw*.ul\_id, *ul\_name*  
**order** **by** *all\_time\_total* **desc**  
)  
**Select** **sum**(*att*.*all\_time\_total*)  
**from** *all\_time\_total* *att*  
;

# Nombre total de bénévole ayant quêté

**with** *cc\_total* **as** (  
	**select** 		*cc*.tronc\_queteur\_id,  
				**sum**(*cc*.quantity \* *cc*.amount) **as** *cc\_total\_per\_tq*  
	**from** 		credit\_card *cc*  
	**group** **by** 	*cc*.tronc\_queteur\_id  
),  
*tq\_amount* **as** (  
	**select**  
    *tq*.id,  
    *tq*.ul\_id,  
    *tq*.queteur\_id,  
    *tq*.point\_quete\_id,  
    *tq*.tronc\_id,  
    *tq*.depart,  
    *tq*.retour,  
    *tq*.comptage,  
    *tq*.deleted,  
	 *tq*.euro2   \* 2    \+  
    *tq*.euro1   \* 1    \+  
    *tq*.cents50 \* 0.5  \+  
    *tq*.cents20 \* 0.2  \+  
    *tq*.cents10 \* 0.1  \+  
    *tq*.cents5  \* 0.05 \+  
    *tq*.cents2  \* 0.02 \+  
    *tq*.cent1   \* 0.01 \+  
    *tq*.euro5   \* 5    \+  
    *tq*.euro10  \* 10   \+  
    *tq*.euro20  \* 20   \+  
    *tq*.euro50  \* 50   \+  
    *tq*.euro100 \* 100  \+  
    *tq*.euro200 \* 200  \+  
    *tq*.euro500 \* 500  \+  
    *tq*.don\_cheque     \+  
    *tq*.don\_creditcard \+  
    **COALESCE**(*cct*.*cc\_total\_per\_tq*, 0)  
    **as** *total\_tq*  
  **from** tronc\_queteur *tq*  
  **left** **join** *cc\_total* *cct* **on** *cct*.tronc\_queteur\_id \= *tq*.id  
  **where** *tq*.deleted \= 0  
  **and** 	 *tq*.comptage **is** **not** **null**  
)  
**select**  **count**(**distinct** *tqa*.queteur\_id)  
**from** *tq\_amount* *tqa*  
**where** *total\_tq* \> 0;

[image1]: <data:image/png;base64,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>