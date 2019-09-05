<?php

if ($_SESSION["usertype"] == 'admin') {
    include_once 'DBConnect.php';
    $sql = "SELECT * FROM activity";
    $result = $conn->query($sql) or die(mysql_error());
    $conn->close();
} else {
    include_once 'DBConnect.php';
    $sql = "SELECT * FROM activity WHERE state = 'active'";
    $result = $conn->query($sql) or die(mysql_error());
    $conn->close();
}
?>