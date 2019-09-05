-- phpMyAdmin SQL Dump
-- version 4.8.3
-- https://www.phpmyadmin.net/
--
-- 主機: 127.0.0.1
-- 產生時間： 2019 年 06 月 08 日 11:27
-- 伺服器版本: 10.1.35-MariaDB
-- PHP 版本： 7.2.9

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 資料庫： `rcal`
--

-- --------------------------------------------------------

--
-- 資料表結構 `activity`
--

CREATE TABLE `activity` (
  `activity_id` int(5) NOT NULL,
  `activity_name` varchar(20) NOT NULL,
  `blog_id` int(5) NOT NULL,
  `rating` int(1) NOT NULL,
  `description` text NOT NULL,
  `category` varchar(20) NOT NULL,
  `difficulty` int(1) NOT NULL,
  `activity_type` varchar(50) NOT NULL,
  `state` varchar(20) NOT NULL DEFAULT 'not active'
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- 資料表的匯出資料 `activity`
--

INSERT INTO `activity` (`activity_id`, `activity_name`, `blog_id`, `rating`, `description`, `category`, `difficulty`, `activity_type`, `state`) VALUES
(1, 'Puzzle game', 1, 3, 'This is a puzzle game', 'Technology', 1, 'Puzzle game', 'active'),
(2, 'Fishing game', 2, 2, 'This is a fishing game', 'Science', 1, 'Fishing game', 'active'),
(3, 'City Hunt game', 3, 5, 'This is a City Hunt game', 'City Hunt game', 1, 'Technology', 'active'),
(4, 'Pictures Observation', 4, 4, 'This is a Pictures Observation game', 'Math', 2, 'Puzzle game', 'active'),
(5, 'If...then game', 5, 2, 'This is a If...then game', 'Science', 3, 'Simple game', 'active'),
(6, 'The Logic Maze', 6, 3, 'This is a The Logic Maze', 'Technology', 2, 'Puzzle game', 'active'),
(9, 'name', 0, 0, 'name', 'cat', 0, 'type', 'wait for approve'),
(11, 'Test', 0, 0, 'Test', 'test', 0, 'test', 'not active');

-- --------------------------------------------------------

--
-- 資料表結構 `user_account`
--

CREATE TABLE `user_account` (
  `user_id` int(5) NOT NULL,
  `email` varchar(50) DEFAULT NULL,
  `username` varchar(50) DEFAULT NULL,
  `password` varchar(20) DEFAULT NULL,
  `user_type` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- 資料表的匯出資料 `user_account`
--

INSERT INTO `user_account` (`user_id`, `email`, `username`, `password`, `user_type`) VALUES
(1, 'abc@abc.com', 'admin', 'admin', 'admin'),
(2, 'bbb@bbb.com', 'user', 'bbb', 'user'),
(4, 'test@test.com', 'test', 'test', 'user'),
(5, 'test2@test2.com', 'testtest', 'test', 'user'),
(6, 'James@jaMEs.com', 'James', 'James', 'user');

--
-- 已匯出資料表的索引
--

--
-- 資料表索引 `activity`
--
ALTER TABLE `activity`
  ADD PRIMARY KEY (`activity_id`);

--
-- 資料表索引 `user_account`
--
ALTER TABLE `user_account`
  ADD PRIMARY KEY (`user_id`);

--
-- 在匯出的資料表使用 AUTO_INCREMENT
--

--
-- 使用資料表 AUTO_INCREMENT `activity`
--
ALTER TABLE `activity`
  MODIFY `activity_id` int(5) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- 使用資料表 AUTO_INCREMENT `user_account`
--
ALTER TABLE `user_account`
  MODIFY `user_id` int(5) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
