<?php

namespace WebNest\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $table = 'webnest_settings';
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected function casts(): array { return ['value' => 'array']; }
}
