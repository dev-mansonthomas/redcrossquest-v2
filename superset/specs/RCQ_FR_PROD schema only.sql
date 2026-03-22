-- MySQL dump 10.13  Distrib 8.0.37, for Linux (x86_64)
--
-- Host: 127.0.0.1    Database: mysql
-- ------------------------------------------------------
-- Server version	8.0.37-google

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `rcq_fr_prod_db`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `rcq_fr_prod_db` /*!40100 DEFAULT CHARACTER SET utf8mb3 */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `rcq_fr_prod_db`;


DROP TABLE IF EXISTS `credit_card`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `credit_card` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tronc_queteur_id` int NOT NULL,
  `ul_id` int NOT NULL,
  `quantity` int NOT NULL,
  `amount` decimal(10,6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `tronc_queteur_id` (`tronc_queteur_id`),
  KEY `ul_id` (`ul_id`),
  CONSTRAINT `credit_card_ibfk_1` FOREIGN KEY (`tronc_queteur_id`) REFERENCES `tronc_queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `credit_card_ibfk_2` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=21436 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `daily_stats_before_rcq`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_stats_before_rcq` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `date` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `nb_benevole` int DEFAULT NULL,
  `nb_benevole_1j` int DEFAULT NULL,
  `nb_heure` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `date` (`date`),
  CONSTRAINT `daily_stats_before_rcq_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2709 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `named_donation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `named_donation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `ref_recu_fiscal` varchar(100) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `donation_date` datetime NOT NULL,
  `don_cheque` decimal(10,2) NOT NULL,
  `address` varchar(200) NOT NULL,
  `postal_code` varchar(15) NOT NULL,
  `city` varchar(70) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `euro500` int DEFAULT NULL COMMENT 'nombre de billets de 500€',
  `euro200` int DEFAULT NULL COMMENT 'nombre de billets de 200€',
  `euro100` int DEFAULT NULL COMMENT 'nombre de billets de 100€',
  `euro50` int DEFAULT NULL COMMENT 'nombre de billets de  50€',
  `euro20` int DEFAULT NULL COMMENT 'nombre de billets de  20€',
  `euro10` int DEFAULT NULL COMMENT 'nombre de billets de  10€',
  `euro5` int DEFAULT NULL COMMENT 'nombre de billets de   5€',
  `euro2` int DEFAULT NULL COMMENT 'nombre de pièces  de   2€',
  `euro1` int DEFAULT NULL COMMENT 'nombre de pièces  de   1€',
  `cents50` int DEFAULT NULL COMMENT 'nombre de pièces  de     50 cents',
  `cents20` int DEFAULT NULL COMMENT 'nombre de pièces  de     20 cents',
  `cents10` int DEFAULT NULL COMMENT 'nombre de pièces  de     10 cents',
  `cents5` int DEFAULT NULL COMMENT 'nombre de pièces  de      5 cents',
  `cents2` int DEFAULT NULL COMMENT 'nombre de pièces  de      2 cents',
  `cent1` int DEFAULT NULL COMMENT 'nombre de pièces  de      1 cent ',
  `notes` text NOT NULL,
  `type` int NOT NULL DEFAULT '1' COMMENT '1:cash, 2:cheque',
  `forme` int NOT NULL DEFAULT '1',
  `don_creditcard` decimal(10,2) DEFAULT NULL,
  `deleted` tinyint(1) NOT NULL DEFAULT '0',
  `coins_money_bag_id` varchar(20) DEFAULT NULL,
  `bills_money_bag_id` varchar(20) DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `last_update_user_id` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `last_update_user_id` (`last_update_user_id`),
  KEY `coins_money_bag_id` (`coins_money_bag_id`),
  KEY `bills_money_bag_id` (`bills_money_bag_id`),
  KEY `deleted` (`deleted`),
  KEY `donation_date` (`donation_date`),
  KEY `first_name` (`first_name`),
  KEY `last_name` (`last_name`),
  KEY `email` (`email`),
  KEY `phone` (`phone`),
  KEY `ref_recu_fiscal` (`ref_recu_fiscal`),
  CONSTRAINT `named_donation_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `named_donation_ibfk_2` FOREIGN KEY (`last_update_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `phinxlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `phinxlog` (
  `version` bigint NOT NULL,
  `migration_name` varchar(100) DEFAULT NULL,
  `start_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `breakpoint` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `point_quete`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `point_quete` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `code` varchar(10) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `latitude` decimal(18,15) NOT NULL,
  `longitude` decimal(18,15) NOT NULL,
  `address` varchar(70) NOT NULL,
  `postal_code` varchar(15) NOT NULL,
  `city` varchar(70) NOT NULL,
  `max_people` varchar(50) DEFAULT NULL COMMENT 'Nombre de personne max sur un point de quête',
  `advice` text,
  `localization` text,
  `minor_allowed` tinyint(1) NOT NULL,
  `created` datetime NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `type` int NOT NULL DEFAULT '1' COMMENT '1:Voix Publique, 2: Pietons, 3:Boutique, 4:Base UL',
  `time_to_reach` int NOT NULL DEFAULT '5' COMMENT 'Temps nécessaire pour atteindre le point de quete en minute',
  `transport_to_reach` int NOT NULL DEFAULT '1' COMMENT '1:à Pied, 2: Voiture, 3:Velo, 4:Train, 5:Autre',
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `name` (`name`),
  KEY `code` (`code`),
  KEY `address` (`address`),
  KEY `city` (`city`),
  KEY `enabled` (`enabled`),
  KEY `type` (`type`),
  CONSTRAINT `point_quete_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2059 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `queteur`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `queteur` (
  `id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `secteur` int NOT NULL,
  `nivol` varchar(15) DEFAULT NULL,
  `mobile` varchar(20) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime DEFAULT NULL,
  `parent_authorization` blob,
  `temporary_volunteer_form` blob,
  `notes` text,
  `ul_id` int NOT NULL,
  `birthdate` date DEFAULT NULL,
  `man` tinyint(1) NOT NULL DEFAULT '1',
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `qr_code_printed` tinyint(1) NOT NULL DEFAULT '0',
  `referent_volunteer` int NOT NULL DEFAULT '0',
  `anonymization_token` varchar(36) DEFAULT NULL,
  `anonymization_date` datetime DEFAULT NULL,
  `anonymization_user_id` int NOT NULL DEFAULT '0',
  `spotfire_access_token` varchar(36) DEFAULT NULL,
  `mailing_preference` int NOT NULL DEFAULT '1',
  `firebase_sign_in_provider` varchar(100) DEFAULT NULL,
  `firebase_uid` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `referent_volunteer` (`referent_volunteer`),
  KEY `anonymization_user_id` (`anonymization_user_id`),
  KEY `anonymization_token` (`anonymization_token`,`mailing_preference`),
  KEY `secteur` (`secteur`),
  KEY `first_name` (`first_name`),
  KEY `last_name` (`last_name`),
  KEY `email` (`email`),
  KEY `nivol` (`nivol`),
  KEY `qr_code_printed` (`qr_code_printed`),
  KEY `active` (`active`),
  KEY `spotfire_access_token` (`spotfire_access_token`),
  CONSTRAINT `queteur_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `queteur_ibfk_2` FOREIGN KEY (`referent_volunteer`) REFERENCES `queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `queteur_ibfk_3` FOREIGN KEY (`anonymization_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=16555 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `queteur_mailing_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `queteur_mailing_status` (
  `id` int NOT NULL AUTO_INCREMENT,
  `queteur_id` int NOT NULL,
  `year` int NOT NULL,
  `status_code` varchar(40) NOT NULL,
  `spotfire_opened` int DEFAULT '0',
  `email_send_date` datetime NOT NULL,
  `spotfire_open_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_queteur_year` (`queteur_id`,`year`),
  KEY `queteur_id` (`queteur_id`),
  KEY `year` (`year`,`status_code`),
  CONSTRAINT `queteur_mailing_status_ibfk_1` FOREIGN KEY (`queteur_id`) REFERENCES `queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=2377 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `queteur_registration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `queteur_registration` (
  `id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `man` tinyint(1) NOT NULL DEFAULT '1',
  `birthdate` date DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `secteur` int NOT NULL,
  `nivol` varchar(15) DEFAULT NULL,
  `mobile` varchar(13) NOT NULL,
  `created` datetime NOT NULL,
  `approval_date` datetime DEFAULT NULL,
  `ul_registration_token` varchar(36) NOT NULL,
  `queteur_registration_token` varchar(36) NOT NULL,
  `registration_approved` tinyint(1) DEFAULT NULL,
  `reject_reason` varchar(200) DEFAULT NULL,
  `queteur_id` int NOT NULL DEFAULT '0',
  `approver_user_id` int NOT NULL DEFAULT '0',
  `firebase_sign_in_provider` varchar(100) DEFAULT NULL,
  `firebase_uid` varchar(64) DEFAULT NULL,
  `benevole_referent` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_queteur_reg_token` (`queteur_registration_token`),
  KEY `ul_registration_token` (`ul_registration_token`),
  KEY `registration_approved` (`registration_approved`),
  KEY `created` (`created`)
) ENGINE=InnoDB AUTO_INCREMENT=3389 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `spotfire_access`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `spotfire_access` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(36) NOT NULL,
  `token_expiration` datetime NOT NULL,
  `ul_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `user_id` (`user_id`),
  KEY `token` (`token`),
  KEY `token_expiration` (`token_expiration`),
  CONSTRAINT `spotfire_access_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `spotfire_access_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=3720 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `tronc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tronc` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `created` datetime NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `notes` varchar(255) DEFAULT NULL,
  `type` int NOT NULL DEFAULT '1' COMMENT '1:tronc, 2:urne chez commercant, 3: Autre, 4: Terminal CB',
  `qr_code_printed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `type` (`type`,`enabled`),
  CONSTRAINT `tronc_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=7566 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `tronc_queteur`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tronc_queteur` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `queteur_id` int NOT NULL,
  `point_quete_id` int NOT NULL,
  `tronc_id` int NOT NULL,
  `depart_theorique` datetime NOT NULL,
  `depart` datetime DEFAULT NULL,
  `retour` datetime DEFAULT NULL,
  `comptage` datetime DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `last_update_user_id` int NOT NULL DEFAULT '0',
  `euro500` int DEFAULT NULL COMMENT 'nombre de billets de 500€',
  `euro200` int DEFAULT NULL COMMENT 'nombre de billets de 200€',
  `euro100` int DEFAULT NULL COMMENT 'nombre de billets de 100€',
  `euro50` int DEFAULT NULL COMMENT 'nombre de billets de  50€',
  `euro20` int DEFAULT NULL COMMENT 'nombre de billets de  20€',
  `euro10` int DEFAULT NULL COMMENT 'nombre de billets de  10€',
  `euro5` int DEFAULT NULL COMMENT 'nombre de billets de   5€',
  `euro2` int DEFAULT NULL COMMENT 'nombre de pièces  de   2€',
  `euro1` int DEFAULT NULL COMMENT 'nombre de pièces  de   1€',
  `cents50` int DEFAULT NULL COMMENT 'nombre de pièces  de     50 cents',
  `cents20` int DEFAULT NULL COMMENT 'nombre de pièces  de     20 cents',
  `cents10` int DEFAULT NULL COMMENT 'nombre de pièces  de     10 cents',
  `cents5` int DEFAULT NULL COMMENT 'nombre de pièces  de      5 cents',
  `cents2` int DEFAULT NULL COMMENT 'nombre de pièces  de      2 cents',
  `cent1` int DEFAULT NULL COMMENT 'nombre de pièces  de      1 cent ',
  `foreign_coins` int DEFAULT NULL COMMENT 'nombre de pièces  étrangères ',
  `foreign_banknote` int DEFAULT NULL COMMENT 'nombre de billets étranger',
  `notes_depart_theorique` text,
  `notes_retour` text,
  `notes_retour_comptage_pieces` text,
  `notes_update` text,
  `deleted` tinyint(1) NOT NULL DEFAULT '0',
  `don_creditcard` float DEFAULT NULL,
  `don_cheque` float DEFAULT NULL,
  `coins_money_bag_id` varchar(20) DEFAULT NULL,
  `bills_money_bag_id` varchar(20) DEFAULT NULL,
  `don_cb_total_number` int DEFAULT NULL,
  `don_cheque_number` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `queteur_id` (`queteur_id`),
  KEY `point_quete_id` (`point_quete_id`),
  KEY `tronc_id` (`tronc_id`),
  KEY `last_update_user_id` (`last_update_user_id`),
  KEY `ul_id` (`ul_id`),
  KEY `deleted` (`deleted`),
  KEY `coins_money_bag_id` (`coins_money_bag_id`),
  KEY `bills_money_bag_id` (`bills_money_bag_id`),
  KEY `deleted_2` (`deleted`),
  KEY `depart_theorique` (`depart_theorique`),
  KEY `depart` (`depart`),
  KEY `retour` (`retour`),
  KEY `comptage` (`comptage`),
  CONSTRAINT `tronc_queteur_ibfk_1` FOREIGN KEY (`queteur_id`) REFERENCES `queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_ibfk_2` FOREIGN KEY (`point_quete_id`) REFERENCES `point_quete` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_ibfk_3` FOREIGN KEY (`tronc_id`) REFERENCES `tronc` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_ibfk_4` FOREIGN KEY (`last_update_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_ibfk_5` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=35226 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `tronc_queteur_historique`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tronc_queteur_historique` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `insert_date` datetime DEFAULT NULL,
  `tronc_queteur_id` int NOT NULL,
  `queteur_id` int NOT NULL,
  `point_quete_id` int NOT NULL,
  `tronc_id` int NOT NULL,
  `depart_theorique` datetime NOT NULL,
  `depart` datetime DEFAULT NULL,
  `retour` datetime DEFAULT NULL,
  `comptage` datetime DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `last_update_user_id` int NOT NULL,
  `euro500` int DEFAULT NULL COMMENT 'nombre de billets de 500€',
  `euro200` int DEFAULT NULL COMMENT 'nombre de billets de 200€',
  `euro100` int DEFAULT NULL COMMENT 'nombre de billets de 100€',
  `euro50` int DEFAULT NULL COMMENT 'nombre de billets de  50€',
  `euro20` int DEFAULT NULL COMMENT 'nombre de billets de  20€',
  `euro10` int DEFAULT NULL COMMENT 'nombre de billets de  10€',
  `euro5` int DEFAULT NULL COMMENT 'nombre de billets de   5€',
  `euro2` int DEFAULT NULL COMMENT 'nombre de pièces  de   2€',
  `euro1` int DEFAULT NULL COMMENT 'nombre de pièces  de   1€',
  `cents50` int DEFAULT NULL COMMENT 'nombre de pièces  de     50 cents',
  `cents20` int DEFAULT NULL COMMENT 'nombre de pièces  de     20 cents',
  `cents10` int DEFAULT NULL COMMENT 'nombre de pièces  de     10 cents',
  `cents5` int DEFAULT NULL COMMENT 'nombre de pièces  de      5 cents',
  `cents2` int DEFAULT NULL COMMENT 'nombre de pièces  de      2 cents',
  `cent1` int DEFAULT NULL COMMENT 'nombre de pièces  de      1 cent ',
  `foreign_coins` int DEFAULT NULL COMMENT 'nombre de pièces  étrangères ',
  `foreign_banknote` int DEFAULT NULL COMMENT 'nombre de billets étranger',
  `notes_depart_theorique` text,
  `notes_retour` text,
  `notes_retour_comptage_pieces` text,
  `notes_update` text,
  `deleted` tinyint(1) NOT NULL DEFAULT '0',
  `don_creditcard` float DEFAULT NULL,
  `don_cheque` float DEFAULT NULL,
  `coins_money_bag_id` varchar(20) DEFAULT NULL,
  `bills_money_bag_id` varchar(20) DEFAULT NULL,
  `don_cb_total_number` int DEFAULT NULL,
  `don_cheque_number` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `queteur_id` (`queteur_id`),
  KEY `point_quete_id` (`point_quete_id`),
  KEY `tronc_id` (`tronc_id`),
  KEY `tronc_queteur_id` (`tronc_queteur_id`),
  KEY `last_update_user_id` (`last_update_user_id`),
  KEY `ul_id` (`ul_id`),
  CONSTRAINT `tronc_queteur_historique_ibfk_1` FOREIGN KEY (`queteur_id`) REFERENCES `queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_historique_ibfk_2` FOREIGN KEY (`point_quete_id`) REFERENCES `point_quete` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_historique_ibfk_3` FOREIGN KEY (`tronc_id`) REFERENCES `tronc` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_historique_ibfk_4` FOREIGN KEY (`tronc_queteur_id`) REFERENCES `tronc_queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_historique_ibfk_5` FOREIGN KEY (`last_update_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `tronc_queteur_historique_ibfk_6` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=178044 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `ul`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ul` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `phone` varchar(13) NOT NULL,
  `latitude` decimal(18,15) NOT NULL,
  `longitude` decimal(18,15) NOT NULL,
  `address` varchar(200) NOT NULL,
  `postal_code` varchar(15) NOT NULL,
  `city` varchar(70) NOT NULL,
  `external_id` int NOT NULL,
  `email` text COMMENT 'email de contact de l''ul',
  `id_structure_rattachement` int NOT NULL DEFAULT '0' COMMENT 'identification de la DT au dessus de l''ul',
  `date_demarrage_activite` datetime DEFAULT NULL COMMENT 'date de création de l''ul',
  `date_demarrage_rcq` datetime DEFAULT NULL COMMENT 'date début d''utilisation de RCQ pour l''ul',
  `mode` int NOT NULL DEFAULT '0' COMMENT '0: non actif, 1: DailyStats, 2: Mode Province, 3: Mode Paris',
  `publicDashboard` varchar(100) NOT NULL DEFAULT 'RCQ-Public-MontantsCachés' COMMENT 'Nom du dashboard spotfire public',
  `spotfire_access_token` text,
  `president_man` tinyint(1) NOT NULL,
  `president_nivol` varchar(15) NOT NULL,
  `president_first_name` varchar(100) NOT NULL,
  `president_last_name` varchar(100) NOT NULL,
  `president_email` varchar(255) DEFAULT NULL,
  `president_mobile` varchar(20) NOT NULL,
  `tresorier_man` tinyint(1) NOT NULL,
  `tresorier_nivol` varchar(15) NOT NULL,
  `tresorier_first_name` varchar(100) NOT NULL,
  `tresorier_last_name` varchar(100) NOT NULL,
  `tresorier_email` varchar(255) DEFAULT NULL,
  `tresorier_mobile` varchar(20) NOT NULL,
  `admin_man` tinyint(1) NOT NULL,
  `admin_nivol` varchar(15) NOT NULL,
  `admin_first_name` varchar(100) NOT NULL,
  `admin_last_name` varchar(100) NOT NULL,
  `admin_email` varchar(255) DEFAULT NULL,
  `admin_mobile` varchar(20) NOT NULL,
  `tresorier_spreadsheet_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=642 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `ul_registration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ul_registration` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `registration_approved` tinyint(1) DEFAULT NULL,
  `reject_reason` varchar(200) DEFAULT NULL,
  `approval_date` datetime DEFAULT NULL,
  `president_man` tinyint(1) NOT NULL,
  `president_nivol` varchar(15) NOT NULL,
  `president_first_name` varchar(100) NOT NULL,
  `president_last_name` varchar(100) NOT NULL,
  `president_email` varchar(255) NOT NULL,
  `president_mobile` varchar(20) NOT NULL,
  `tresorier_man` tinyint(1) NOT NULL,
  `tresorier_nivol` varchar(15) NOT NULL,
  `tresorier_first_name` varchar(100) NOT NULL,
  `tresorier_last_name` varchar(100) NOT NULL,
  `tresorier_email` varchar(255) NOT NULL,
  `tresorier_mobile` varchar(20) NOT NULL,
  `admin_man` tinyint(1) NOT NULL,
  `admin_nivol` varchar(15) NOT NULL,
  `admin_first_name` varchar(100) NOT NULL,
  `admin_last_name` varchar(100) NOT NULL,
  `admin_email` varchar(255) NOT NULL,
  `admin_mobile` varchar(20) NOT NULL,
  `registration_token` varchar(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ul_id` (`ul_id`),
  CONSTRAINT `ul_registration_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=103 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;

DROP TABLE IF EXISTS `ul_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ul_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `settings` text NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime DEFAULT NULL,
  `last_update_user_id` int NOT NULL,
  `thanks_mail_benevole` varchar(8000) DEFAULT NULL,
  `thanks_mail_benevole1j` varchar(8000) DEFAULT NULL,
  `token_benevole` varchar(36) DEFAULT NULL,
  `token_benevole_1j` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_ul_settings_ul_id` (`ul_id`),
  KEY `ul_id` (`ul_id`),
  KEY `last_update_user_id` (`last_update_user_id`),
  CONSTRAINT `ul_settings_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `ul_settings_ibfk_2` FOREIGN KEY (`last_update_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=628 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nivol` varchar(20) DEFAULT NULL,
  `queteur_id` int NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` varchar(20) NOT NULL,
  `created` datetime NOT NULL,
  `updated` datetime DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  `last_failure_login_date` datetime DEFAULT NULL,
  `nb_of_failure` int NOT NULL DEFAULT '0',
  `last_successful_login_date` datetime DEFAULT NULL,
  `init_passwd_uuid` varchar(36) DEFAULT NULL,
  `init_passwd_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `queteur_id` (`queteur_id`),
  KEY `active` (`active`),
  KEY `nivol` (`nivol`),
  KEY `init_passwd_uuid` (`init_passwd_uuid`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`queteur_id`) REFERENCES `queteur` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=1656 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


DROP TABLE IF EXISTS `yearly_goal`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `yearly_goal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ul_id` int NOT NULL,
  `year` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `day_1_percentage` int NOT NULL,
  `day_2_percentage` int NOT NULL,
  `day_3_percentage` int NOT NULL,
  `day_4_percentage` int NOT NULL,
  `day_5_percentage` int NOT NULL,
  `day_6_percentage` int NOT NULL,
  `day_7_percentage` int NOT NULL,
  `day_8_percentage` int NOT NULL,
  `day_9_percentage` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ul_id` (`ul_id`),
  KEY `year` (`year`),
  CONSTRAINT `yearly_goal_ibfk_1` FOREIGN KEY (`ul_id`) REFERENCES `ul` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=243 DEFAULT CHARSET=utf8mb3;
/*!40101 SET character_set_client = @saved_cs_client */;


/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-03 12:27:34
