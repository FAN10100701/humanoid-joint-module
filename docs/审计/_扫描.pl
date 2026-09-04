#!/usr/bin/perl
# 站点知识点全量评估 · 量化底表扫描脚本
# 输入: docs/审计/_清单底稿.txt (cls\tpath\tsize 三列)
# 输出: docs/审计/_底表.csv (A/C 类页 8 类标记计数) + docs/审计/_题库统计.txt
use strict;
use warnings;
use utf8;
binmode STDOUT, ':encoding(UTF-8)';

open my $list, '<:encoding(UTF-8)', 'docs/审计/_清单底稿.txt' or die "清单读取失败: $!";
open my $out, '>:encoding(UTF-8)', 'docs/审计/_底表.csv' or die "底表创建失败: $!";
print $out "path\tbytes\tcls\ttitle\tpageId\t公式\t表格\tquiz\t解析数\t解析字数\t误区\t代码\t调试\t图表\n";

while (my $line = <$list>) {
    chomp $line;
    my ($cls, $bytes, $p) = split /\t/, $line;
    next if $cls eq 'B';                     # B 类壳页不扫
    $p =~ s/^\.\///;
    open my $fh, '<:encoding(UTF-8)', $p or do { print $out "$p\t$bytes\t$cls\tREAD_FAIL\t-\n"; next };
    local $/;
    my $s = <$fh>;
    close $fh;

    my ($title) = $s =~ /<title>([^<]*)<\/title>/;
    my ($pid)   = $s =~ /id:\s*"([^"]*)"/;
    $title //= '';
    $pid   //= '';

    my $formula = () = $s =~ /katex|\\\(/g;                    # KaTeX/行内公式痕迹
    my $table   = () = $s =~ /<table/g;                        # 表格
    my $quiz    = () = $s =~ /data-answer=/g;                  # 页面内嵌选择题
    my ($exn, $exch) = (0, 0);
    while ($s =~ /quiz-explain[^>]*>(.*?)<\/div>/gs) {         # 解析文本长度
        my $t = $1;
        $t =~ s/<[^>]*>//g;
        $t =~ s/\s//g;
        $exn++;
        $exch += length($t);
    }
    my $misuse = () = $s =~ /常见误区|易错|避坑|误区/g;          # 误区/易错点
    my $code   = () = $s =~ /<pre/g;                           # 代码块
    my $debug  = () = $s =~ /调试|排错|排查|决策树|示波器|断点|gdb|万用表/g;  # 工程调试线索
    my $fig    = () = $s =~ /<svg|<canvas|<img/g;              # 图示

    print $out join("\t", $p, $bytes, $cls, $title, $pid,
                    $formula, $table, $quiz, $exn, $exch, $misuse, $code, $debug, $fig), "\n";
}
close $list;
close $out;
print "底表完成\n";

# ---------- JS 题库统计 ----------
open my $tb, '>:encoding(UTF-8)', 'docs/审计/_题库统计.txt' or die $!;
for my $f ('_assets/quiz-bank.js', '_assets/quest-data.js', '_assets/ib-data-a.js', '_assets/ib-data-b.js', '_assets/ib-data-c.js') {
    open my $fh, '<:encoding(UTF-8)', $f or do { print $tb "$f  READ_FAIL\n"; next };
    local $/;
    my $s = <$fh>;
    close $fh;
    my $qn  = () = $s =~ /\bq:/g;                              # 题目数
    my ($exn, $exch) = (0, 0);
    while ($s =~ /\be:\s*"((?:[^"\\]|\\.)*)"/g) {              # 解析长度
        my $t = $1;
        $t =~ s/\s//g;
        $exn++;
        $exch += length($t);
    }
    my %lv;
    while ($s =~ /\blv:\s*(\d)/g) { $lv{$1}++ }                # 复试频率星级分布
    my $groups = () = $s =~ /\bg:\s*"/g;                       # quiz-bank 分组数
    print $tb "$f\t题数q:$qn\t解析数:$exn\t解析均长:" . ($exn ? int($exch / $exn) : 0) . "\t分组:$groups\tlv分布:" .
              (join ',', map {"$_星=$lv{$_}"} sort keys %lv) . "\n";
}
close $tb;
print "题库统计完成\n";
