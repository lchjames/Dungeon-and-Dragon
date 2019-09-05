<?php

$conn = new mysqli();
$host = "127.0.0.1";
$user = "root";
$password = "";
$dbname = "rcal";
$conn->connect($host, $user, $password, $dbname);
if (mysqli_connect_errno()) {
    echo("Failed to connect, the error message is : " .
    mysqli_connect_error());
    exit();
}
$conn->close();
?>